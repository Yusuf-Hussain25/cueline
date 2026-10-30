import type { DetectionPath } from "@cueline/shared";
import { analyzeTurn, fingerprint, type TurnAnalysis } from "./heuristics.ts";

// Turns a stream of final transcript segments into questions.
//
// A "turn" is everything the interviewer said between two end-of-speech signals from the STT
// (speech_final after a short silence, or UtteranceEnd as a backup). When a turn ends:
//   1. heuristics decide the clear cases instantly;
//   2. a cut-off turn ("tell me about a time when…") waits `holdMs` for more speech;
//   3. ambiguous turns go to the LLM classifier, bounded by `classifierTimeoutMs`;
//   4. statements are kept for a short while as context for the next question
//      ("We're migrating to Kafka." … "How would you handle ordering?");
//   5. backstop: if the interim transcript stops changing for `stableMs` and already reads as a clear
//      question, answer it without waiting for the STT's end-of-speech signal, which occasionally
//      lags by seconds. A quick "…and when would you use each?" is merged into that question.

/** A follow-on clause starting with "and…" within this window extends the previous question. */
const CONTINUATION_WINDOW_MS = 8000;

export type Classify = (text: string, signal: AbortSignal) => Promise<boolean>;

export interface DetectedQuestion {
  text: string;
  path: DetectionPath;
  /** Audio time (s) of the last word, used to measure latency from the end of speech. */
  speechEnd: number | null;
  /** Statements from just before the question, passed to the LLM as context. */
  preamble: string | null;
}

export interface DetectorEvents {
  onQuestion: (q: DetectedQuestion) => void;
  onIgnored: (text: string, reason: string) => void;
  onPending: (text: string) => void;
}

export interface DetectorOptions {
  classify: Classify;
  holdMs?: number;
  classifierTimeoutMs?: number;
  /** A repeat of the last question within this window isn't answered twice. */
  repeatWindowMs?: number;
  preambleWindowMs?: number;
  /** How long interim text must stay unchanged before it can close the turn on its own. */
  stableMs?: number;
  now?: () => number;
}

export class QuestionDetector {
  private segments: string[] = [];
  private speechEnd: number | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private classifying: AbortController | null = null;
  /** Bumped whenever the turn changes, so stale async results are dropped. */
  private generation = 0;
  private last: { text: string; fingerprint: string; at: number } | null = null;
  private preamble: { text: string; at: number } | null = null;
  private interimState: { segmentId: string; text: string; end: number } | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  /** An interim segment answered early; its final must not open a new turn. */
  private consumed: { segmentId: string; fingerprint: string } | null = null;

  private readonly events: DetectorEvents;
  private readonly classify: Classify;
  private readonly holdMs: number;
  private readonly classifierTimeoutMs: number;
  private readonly repeatWindowMs: number;
  private readonly preambleWindowMs: number;
  private readonly stableMs: number;
  private readonly now: () => number;

  constructor(events: DetectorEvents, options: DetectorOptions) {
    this.events = events;
    this.classify = options.classify;
    this.holdMs = options.holdMs ?? 1400;
    this.classifierTimeoutMs = options.classifierTimeoutMs ?? 1200;
    this.repeatWindowMs = options.repeatWindowMs ?? 20000;
    this.preambleWindowMs = options.preambleWindowMs ?? 20000;
    this.stableMs = options.stableMs ?? 900;
    this.now = options.now ?? Date.now;
  }

  /** A final transcript segment (text that won't change any more). */
  addFinal(text: string, end: number, segmentId?: string) {
    this.clearInterim();
    let t = text.trim();
    if (this.consumed && segmentId === this.consumed.segmentId) {
      // Already answered from its interim text: keep only words said after that
      const print = fingerprint(t);
      const rest = print.startsWith(this.consumed.fingerprint) ? print.slice(this.consumed.fingerprint.length).trim() : "";
      this.consumed = null;
      if (rest.split(" ").filter(Boolean).length < 2) return;
      t = rest;
    }
    if (!t) return;
    this.segments.push(t);
    this.speechEnd = end;
    this.interrupt();
  }

  /** Interim (still changing) text for the current segment. */
  interim(segmentId: string, text: string, end: number) {
    const t = text.trim();
    if (!t || (this.consumed && segmentId === this.consumed.segmentId)) return;
    if (this.interimState?.segmentId === segmentId && this.interimState.text === t) return;
    this.speechActivity();
    this.interimState = { segmentId, text: t, end };
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = setTimeout(() => this.closeOnStableInterim(), this.stableMs);
  }

  /** The interviewer is talking again: whatever we were waiting on is no longer the whole turn. */
  speechActivity() {
    if (!this.holdTimer && !this.classifying) return;
    this.interrupt();
    // Normally new finals and a fresh end-of-turn follow. If they never do (it was a cough the STT
    // half-heard), judge what we have instead of leaving the question stuck.
    const generation = this.generation;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (generation === this.generation && this.segments.length) this.evaluate(true);
    }, this.holdMs + 1000);
  }

  /** The STT thinks the speaker stopped. */
  endOfTurn() {
    if (this.segments.length === 0 || this.holdTimer || this.classifying) return;
    this.evaluate(false);
  }

  /** "Answer now": treat the current turn (or the last ignored statement) as the question. */
  force(): boolean {
    this.interrupt();
    const text = this.segments.join(" ").trim() || this.preamble?.text || "";
    if (!text) return false;
    const speechEnd = this.segments.length ? this.speechEnd : null;
    this.clearTurn();
    this.preamble = null;
    this.emit(text, "forced", speechEnd, { skipRepeatCheck: true });
    return true;
  }

  reset() {
    this.interrupt();
    this.clearTurn();
    this.clearInterim();
    this.consumed = null;
    this.last = null;
    this.preamble = null;
  }

  private closeOnStableInterim() {
    this.stableTimer = null;
    const pending = this.interimState;
    if (!pending) return;
    // Only clear-cut questions: anything uncertain still waits for the STT's own end of turn
    const raw = [...this.segments, pending.text].join(" ");
    const analysis = analyzeTurn(raw);
    if (analysis.verdict !== "question") return;
    this.interrupt();
    this.clearTurn();
    this.clearInterim();
    this.consumed = { segmentId: pending.segmentId, fingerprint: fingerprint(pending.text) };
    this.emit(analysis.cleaned, "heuristic", pending.end, { raw });
  }

  private clearInterim() {
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
    this.interimState = null;
  }

  private evaluate(allowIncomplete: boolean) {
    const text = this.segments.join(" ");
    const analysis = analyzeTurn(text, { allowIncomplete });
    const speechEnd = this.speechEnd;

    switch (analysis.verdict) {
      case "question":
        this.clearTurn();
        this.emit(analysis.cleaned, "heuristic", speechEnd, { raw: text });
        return;
      case "not_question":
        this.clearTurn();
        this.ignore(text, analysis);
        return;
      case "incomplete": {
        this.events.onPending(text);
        const generation = this.generation;
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          if (generation === this.generation) this.evaluate(true);
        }, this.holdMs);
        return;
      }
      case "unsure":
        void this.runClassifier(text, analysis, speechEnd);
        return;
    }
  }

  private async runClassifier(text: string, analysis: TurnAnalysis, speechEnd: number | null) {
    const generation = this.generation;
    const controller = new AbortController();
    this.classifying = controller;
    const timeout = setTimeout(() => controller.abort(), this.classifierTimeoutMs);

    let isQuestion: boolean;
    let path: DetectionPath = "classifier";
    try {
      isQuestion = await this.classify(analysis.cleaned, controller.signal);
    } catch {
      // Timed out or failed: fall back to the heuristic score rather than stall the call
      isQuestion = analysis.score >= 2;
      path = "heuristic";
    } finally {
      clearTimeout(timeout);
    }

    // The interviewer kept talking while we classified; the new, longer turn will be judged instead
    if (generation !== this.generation) return;
    this.classifying = null;
    this.clearTurn();
    if (isQuestion) this.emit(analysis.cleaned, path, speechEnd, { raw: text });
    else this.ignore(text, { ...analysis, reason: path === "classifier" ? "classifier: not a question" : analysis.reason });
  }

  private emit(text: string, path: DetectionPath, speechEnd: number | null, { skipRepeatCheck = false, raw = text } = {}) {
    const now = this.now();
    // "…and when would you pick each one?" right after a question continues it. Checked on the raw
    // turn, because filler stripping removes a leading "and".
    if (this.last && now - this.last.at < CONTINUATION_WINDOW_MS && /^(?:and|or|also|plus)\b/i.test(raw.trim())) {
      const conjunction = raw.trim().split(/[\s,]+/)[0]!.toLowerCase();
      const rest = text.replace(/^(?:and|or|also|plus)\b[,\s]*/i, "");
      text = `${this.last.text.replace(/[?.!]+$/, "")}, ${conjunction} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
      skipRepeatCheck = true;
    }
    const print = fingerprint(text);
    if (!skipRepeatCheck && this.last && this.last.fingerprint === print && now - this.last.at < this.repeatWindowMs) {
      this.events.onIgnored(text, "repeat of the last question");
      return;
    }
    this.last = { text, fingerprint: print, at: now };
    const preamble = this.preamble && now - this.preamble.at < this.preambleWindowMs ? this.preamble.text : null;
    this.preamble = null;
    this.events.onQuestion({ text, path, speechEnd, preamble });
  }

  private ignore(text: string, analysis: TurnAnalysis) {
    // Real statements (not "great, thanks") can set up the next question
    if (analysis.reason === "statement" || analysis.reason.startsWith("statement about") || analysis.reason.startsWith("classifier")) {
      this.preamble = { text: analysis.cleaned, at: this.now() };
    }
    this.events.onIgnored(text, analysis.reason);
  }

  private interrupt() {
    this.generation += 1;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.classifying?.abort();
    this.classifying = null;
  }

  private clearTurn() {
    this.segments = [];
    this.speechEnd = null;
  }
}
