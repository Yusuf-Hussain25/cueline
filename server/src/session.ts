import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { z } from "zod";
import {
  LIMITS,
  SAMPLE_RATE,
  type AnswerMetrics,
  type CandidateContext,
  type ClientMessage,
  type DetectionPath,
  type ErrorCode,
  type ServerInfo,
  type ServerMessage,
  type SessionState,
} from "@cueline/shared";
import { Answerer } from "./answer/answerer.ts";
import { config } from "./config.ts";
import { QuestionDetector, type DetectedQuestion } from "./detect/detector.ts";
import type { LlmClient } from "./llm/types.ts";
import type { Logger } from "./lib/log.ts";
import { createDeepgramStream } from "./stt/deepgram.ts";
import type { SttStream } from "./stt/types.ts";

// One Session per WebSocket connection. It wires the pipeline together and owns its state:
//
//   browser audio ─▶ SttStream ─▶ transcript ─▶ QuestionDetector ─▶ Answerer ─▶ browser
//
// Nothing here blocks: audio is forwarded as it arrives, detection is synchronous or bounded by a
// timeout, and answers stream token by token. A new question cancels the answer in progress.

const contextSchema = z.object({
  resume: z.string().max(LIMITS.contextChars, `Resume is limited to ${LIMITS.contextChars} characters.`),
  jobDescription: z.string().max(LIMITS.contextChars, `Job description is limited to ${LIMITS.contextChars} characters.`),
});

const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), context: contextSchema }),
  z.object({ type: z.literal("stop") }),
  z.object({ type: z.literal("context"), context: contextSchema }),
  z.object({ type: z.literal("force_answer") }),
  z.object({ type: z.literal("cancel_answer") }),
  z.object({ type: z.literal("ask"), text: z.string().trim().min(1).max(LIMITS.questionChars) }),
  z.object({ type: z.literal("reset_memory") }),
]) satisfies z.ZodType<ClientMessage>;

/** A guard against a stuck loop burning the LLM quota, far above any real interview pace. */
const MAX_QUESTIONS_PER_MINUTE = 15;

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export interface SessionDeps {
  llm: LlmClient | null;
  info: ServerInfo;
  log: Logger;
}

export class Session {
  private state: SessionState = "idle";
  private context: CandidateContext = { resume: "", jobDescription: "" };
  private stt: SttStream | null = null;
  private run = 0;
  private current: { id: string; controller: AbortController } | null = null;
  private recentQuestions: number[] = [];
  /** Anchor for converting STT audio time to wall-clock time (see audioToWall). */
  private audioSeconds = 0;
  private lastAudioAt = 0;

  private readonly ws: WebSocket;
  private readonly deps: SessionDeps;
  private readonly log: Logger;
  private readonly answerer: Answerer | null;
  private readonly detector: QuestionDetector;

  constructor(ws: WebSocket, deps: SessionDeps) {
    this.ws = ws;
    this.deps = deps;
    this.log = deps.log;
    this.answerer = deps.llm ? new Answerer(deps.llm, config.memoryTurns) : null;
    this.detector = new QuestionDetector(
      {
        onQuestion: (q) => void this.answer(q),
        onIgnored: (text, reason) => this.send({ type: "ignored", text, reason, at: Date.now() }),
        onPending: (text) => this.send({ type: "pending", text, at: Date.now() }),
      },
      {
        classify: (text, signal) => (this.answerer ? this.answerer.isQuestion(text, signal) : Promise.reject(new Error("no llm"))),
      },
    );
    this.send({ type: "ready", info: deps.info });
  }

  handleText(raw: string) {
    let parsed: ClientMessage;
    try {
      const result = clientMessageSchema.safeParse(JSON.parse(raw));
      if (!result.success) {
        this.error("bad_request", result.error.issues[0]?.message ?? "Invalid message.", false);
        return;
      }
      parsed = result.data;
    } catch {
      this.error("bad_request", "Messages must be JSON.", false);
      return;
    }

    switch (parsed.type) {
      case "start":
        this.context = parsed.context;
        this.start();
        return;
      case "stop":
        this.stop();
        return;
      case "context":
        this.context = parsed.context;
        return;
      case "force_answer":
        if (!this.detector.force()) this.error("bad_request", "Nothing has been said yet to answer.", false);
        return;
      case "cancel_answer":
        this.cancelAnswer();
        return;
      case "ask":
        void this.answer({ text: parsed.text, path: "typed", speechEnd: null, preamble: null });
        return;
      case "reset_memory":
        this.answerer?.clearMemory();
        this.send({ type: "memory_cleared" });
        return;
    }
  }

  handleAudio(chunk: Buffer) {
    if (!this.stt) return;
    if (chunk.length === 0 || chunk.length % 2 !== 0 || chunk.length > LIMITS.audioFrameBytes) {
      this.error("bad_request", "Audio frames must be 16-bit PCM, at most one second long.", false);
      return;
    }
    this.audioSeconds += chunk.length / 2 / SAMPLE_RATE;
    this.lastAudioAt = Date.now();
    this.stt.send(chunk);
  }

  close() {
    this.stop();
  }

  private start() {
    if (this.stt) return;
    if (!config.stt.apiKey) {
      // Fatal for this start: the browser should stop capturing, since the audio has nowhere to go
      this.error("not_configured", "DEEPGRAM_API_KEY is missing from .env, so audio can't be transcribed.", true);
      return;
    }
    this.run += 1;
    const run = this.run;
    this.audioSeconds = 0;
    this.lastAudioAt = Date.now();
    this.detector.reset();
    this.setState("connecting");

    this.stt = createDeepgramStream(
      { ...config.stt, apiKey: config.stt.apiKey },
      {
        onOpen: () => {
          if (run === this.run && this.state === "connecting") this.setState("listening");
        },
        onTranscript: (e) => {
          if (run !== this.run) return;
          if (e.text) this.send({ type: "transcript", segmentId: `r${run}-${e.segmentId}`, text: e.text, isFinal: e.isFinal, at: Date.now() });
          if (e.isFinal) this.detector.addFinal(e.text, e.end, e.segmentId);
          else if (e.text) this.detector.interim(e.segmentId, e.text, e.end);
          if (e.speechFinal) this.detector.endOfTurn();
        },
        onUtteranceEnd: () => {
          if (run === this.run) this.detector.endOfTurn();
        },
        onSpeechStarted: () => {},
        onError: (err) => {
          if (run !== this.run) return;
          this.log.warn("stt error", { message: err.message, fatal: err.fatal });
          this.error("stt_failed", err.message, err.fatal);
          if (err.fatal) this.stop();
        },
      },
      this.log,
    );
  }

  private stop() {
    if (this.stt) {
      this.stt.finish();
      this.stt = null;
      this.run += 1;
    }
    this.detector.reset();
    this.cancelAnswer();
    this.setState("idle");
  }

  private cancelAnswer() {
    this.current?.controller.abort();
    this.current = null;
  }

  private async answer(q: DetectedQuestion & { path: DetectionPath }) {
    if (!this.answerer) {
      this.error("not_configured", "No LLM API key is configured in .env, so answers can't be generated.", false);
      return;
    }
    const now = Date.now();
    this.recentQuestions = this.recentQuestions.filter((t) => now - t < 60000);
    if (this.recentQuestions.length >= MAX_QUESTIONS_PER_MINUTE) {
      this.error("rate_limited", "Too many questions in the last minute. Give it a moment.", false);
      return;
    }
    this.recentQuestions.push(now);

    // A newer question wins: the interviewer moved on
    this.cancelAnswer();
    const id = randomUUID().slice(0, 8);
    const controller = new AbortController();
    this.current = { id, controller };
    const detectedAt = Date.now();
    const speechEndAt = q.speechEnd === null ? null : this.audioToWall(q.speechEnd);

    this.send({ type: "question", id, text: q.text, path: q.path, at: detectedAt });
    this.setState("thinking");
    this.log.info("question", { id, path: q.path, text: q.text.slice(0, 80) });

    let text = "";
    let firstTokenAt: number | null = null;
    let cancelled = false;
    try {
      const result = await this.answerer.answer({
        question: q.text,
        preamble: q.preamble,
        context: this.context,
        signal: controller.signal,
        onDelta: (delta) => {
          if (this.current?.id !== id) return;
          if (this.state !== "answering") this.setState("answering");
          this.send({ type: "answer_delta", id, delta });
        },
      });
      text = result.text;
      firstTokenAt = result.firstTokenAt;
      cancelled = result.cancelled;
    } catch (err) {
      cancelled = true;
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : "The answer couldn't be generated.";
        this.log.warn("llm error", { id, message });
        this.error("llm_failed", message, false);
      }
    }

    const doneAt = Date.now();
    const metrics: AnswerMetrics = {
      detectMs: speechEndAt === null ? null : Math.max(0, detectedAt - speechEndAt),
      ttftMs: firstTokenAt === null ? null : firstTokenAt - detectedAt,
      endToEndMs: speechEndAt === null || firstTokenAt === null ? null : firstTokenAt - speechEndAt,
      totalMs: speechEndAt === null ? null : doneAt - speechEndAt,
      words: wordCount(text),
    };
    this.send({ type: "answer_done", id, text, metrics, cancelled });
    this.log.info("answer", { id, cancelled, ...metrics });

    if (this.current?.id === id) {
      this.current = null;
      this.setState(this.stt ? "listening" : "idle");
    }
  }

  /**
   * Converts STT audio time (seconds since the stream began) to wall-clock time. We anchor on the
   * newest chunk rather than the first one, so jitter or a reconnect early in the call doesn't skew
   * later measurements. It measures from when the server received that audio, which is roughly
   * 50–100 ms after it was spoken (browser batching plus upload).
   */
  private audioToWall(audioTime: number) {
    return this.lastAudioAt - (this.audioSeconds - audioTime) * 1000;
  }

  private setState(state: SessionState) {
    if (this.state === state) return;
    this.state = state;
    this.send({ type: "state", state });
  }

  private error(code: ErrorCode, message: string, fatal: boolean) {
    this.send({ type: "error", code, message, fatal });
  }

  private send(message: ServerMessage) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}
