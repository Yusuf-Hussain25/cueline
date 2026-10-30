"use client";

import { FileText, Mic, MonitorUp, Play, Send, Square, TriangleAlert, Zap } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CandidateContext } from "@cueline/shared";
import type { AudioSource } from "@/lib/audio";
import { contextStore } from "@/lib/contextStore";
import { useCueline } from "@/lib/useCueline";
import { AnswerCard, QuestionCard } from "./AnswerPanel";
import { ContextDrawer } from "./ContextDrawer";
import { HistoryPanel } from "./HistoryPanel";
import { LevelMeter } from "./LevelMeter";
import { MetricsBar } from "./MetricsBar";
import { StatusPill } from "./StatusPill";
import { ThemeToggle } from "./ThemeToggle";
import { Toasts } from "./Toasts";
import { TranscriptPanel } from "./TranscriptPanel";
import { Logo } from "./ui/Logo";

export function Cockpit() {
  const levelRef = useRef(0);
  const cue = useCueline(levelRef);
  const { state } = cue;
  const context = useSyncExternalStore(contextStore.subscribe, contextStore.get, contextStore.getServer);
  const [source, setSource] = useState<AudioSource>("tab");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [typed, setTyped] = useState("");
  // Clock for "12s ago" labels. Starts at 0 (reads as "just now") so the prerender stays static.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  const connected = state.connection === "open";
  const running = state.session !== "idle";
  const problems = state.info?.problems ?? [];
  const hasContext = Boolean(context.resume || context.jobDescription);
  const busy = state.session === "thinking" || state.session === "answering";

  const start = async () => {
    setStarting(true);
    await cue.start(source, context);
    setStarting(false);
  };

  const saveContext = (next: CandidateContext) => {
    contextStore.set(next);
    if (running) cue.updateContext(next);
  };

  const metricsHistory = [
    ...(state.answer?.done && state.answer.metrics ? [state.answer.metrics] : []),
    ...state.history.map((h) => h.answer.metrics).filter((m) => m !== null),
  ];

  return (
    <>
      <div className="aurora" aria-hidden="true" />
      <main className="shell">
        <header className="panel topbar">
          <div className="brand">
            <Logo />
            <div>
              Cueline
              <small>live interview copilot</small>
            </div>
          </div>
          <StatusPill state={state.session} connection={state.connection} />
          <span className="grow" />
          <div className="topbar-actions">
            {state.info && (
              <span className="chip hide-sm" title="Speech-to-text and LLM in use">
                {state.info.stt.provider} {state.info.stt.model} · {state.info.llm.provider} {state.info.llm.model}
              </span>
            )}
            <button type="button" className="btn btn-sm" onClick={() => setDrawerOpen(true)} aria-label="Edit resume and job description">
              <FileText size={15} />
              {hasContext ? "Context" : "Add resume & JD"}
              {hasContext && <span className="chip good" style={{ height: 20, padding: "0 7px" }}>✓</span>}
            </button>
            <ThemeToggle />
          </div>
        </header>

        {problems.length > 0 && (
          <div className="banner" role="alert">
            <TriangleAlert size={18} />
            <div>
              <strong>Setup needed before going live</strong>
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span style={{ color: "var(--text-3)" }}>
                Add the keys to <code>.env</code> (see <code>.env.example</code>) and restart the server.
              </span>
            </div>
          </div>
        )}

        <div className="workspace">
          <div className="col">
            <section className="panel dock" aria-label="Controls">
              <div className="dock-row">
                <div className="segmented" role="group" aria-label="Audio source">
                  <button type="button" aria-pressed={source === "tab"} disabled={running} onClick={() => setSource("tab")}>
                    <MonitorUp size={15} /> Meeting tab
                  </button>
                  <button type="button" aria-pressed={source === "mic"} disabled={running} onClick={() => setSource("mic")}>
                    <Mic size={15} /> Microphone
                  </button>
                </div>
                <span style={{ flex: 1 }} />
                <LevelMeter levelRef={levelRef} active={running} />
              </div>
              <div className="dock-row">
                {running ? (
                  <button type="button" className="btn btn-danger btn-lg" onClick={cue.stop}>
                    <Square size={16} /> Stop
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!connected || starting || !state.info?.stt.ready}>
                    <Play size={16} /> {starting ? "Choose a tab…" : "Start listening"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-lg"
                  onClick={cue.forceAnswer}
                  disabled={!running || busy}
                  title="Answer what the interviewer has said so far"
                  style={{ flex: "0 0 auto" }}
                >
                  <Zap size={16} /> Answer now
                </button>
              </div>
              <p className="hint">
                {source === "tab"
                  ? "Pick the Meet or Zoom tab in the share dialog and keep “Share tab audio” on. Only the interviewer is captured."
                  : "Uses your microphone. It also hears you, so this works best when the interviewer comes through speakers."}
                {!hasContext && " Add your resume first so answers are about you."}
              </p>
            </section>
            <TranscriptPanel items={state.transcript} listening={running} onClear={cue.clearTranscript} />
          </div>

          <div className="col">
            <QuestionCard question={state.question} now={now} />
            <AnswerCard answer={state.answer} onCancel={cue.cancelAnswer} />
            <MetricsBar metrics={state.answer?.metrics ?? null} all={metricsHistory} />
            <form
              className="panel ask"
              onSubmit={(e) => {
                e.preventDefault();
                const text = typed.trim();
                if (!text) return;
                cue.ask(text);
                setTyped("");
              }}
            >
              <input
                className="input"
                value={typed}
                maxLength={600}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Or type a question to test the answer…"
                aria-label="Type a question"
                disabled={!connected || !state.info?.llm.ready}
              />
              <button type="submit" className="btn btn-primary" disabled={!typed.trim() || !connected || !state.info?.llm.ready} aria-label="Ask">
                <Send size={15} /> <span className="hide-sm">Ask</span>
              </button>
            </form>
            <HistoryPanel history={state.history} memoryTurns={state.info?.memoryTurns ?? 4} onReset={cue.resetMemory} />
          </div>
        </div>
      </main>

      <Toasts toasts={state.toasts} onDismiss={cue.dismissToast} />
      {drawerOpen && <ContextDrawer initial={context} onSave={saveContext} onClose={() => setDrawerOpen(false)} />}
    </>
  );
}
