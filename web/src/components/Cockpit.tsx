"use client";

import { TriangleAlert } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import type { AudioSource } from "@/lib/audio";
import { contextStore, toCandidateContext, type StoredContext } from "@/lib/contextStore";
import { useCueline } from "@/lib/useCueline";
import { AnswerCard, QuestionCard } from "./AnswerPanel";
import { AudioSourceCard } from "./AudioSourceCard";
import { ContextCard } from "./ContextCard";
import { ContextDrawer } from "./ContextDrawer";
import { HelpDrawer, HistoryDrawer } from "./Drawers";
import { MetricsBar } from "./MetricsBar";
import { Rail } from "./Rail";
import { Toasts } from "./Toasts";
import { TopBar } from "./TopBar";
import { TranscriptPanel } from "./TranscriptPanel";

type Panel = "context" | "history" | "help" | null;

export function Cockpit() {
  const levelRef = useRef(0);
  const cue = useCueline(levelRef);
  const { state } = cue;
  const context = useSyncExternalStore(contextStore.subscribe, contextStore.get, contextStore.getServer);
  const [source, setSource] = useState<AudioSource>("tab");
  const [panel, setPanel] = useState<Panel>(null);
  const [starting, setStarting] = useState(false);

  const connected = state.connection === "open";
  const running = state.session !== "idle";
  const problems = state.info?.problems ?? [];
  const llmReady = connected && Boolean(state.info?.llm.ready);

  const start = async () => {
    setStarting(true);
    await cue.start(source, toCandidateContext(context));
    setStarting(false);
  };

  const saveContext = (next: StoredContext) => {
    contextStore.set(next);
    if (running) cue.updateContext(toCandidateContext(next));
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      cue.notify("Answer copied");
    } catch {
      cue.notify("Couldn't copy. Select the text instead.");
    }
  };

  const metricsHistory = [
    ...(state.answer?.done && state.answer.metrics ? [state.answer.metrics] : []),
    ...state.history.map((h) => h.answer.metrics).filter((m) => m !== null),
  ];

  return (
    <div className="app">
      <TopBar
        state={state.session}
        connection={state.connection}
        info={state.info}
        hasContext={Boolean(context.resume || context.jobDescription)}
        onOpenContext={() => setPanel("context")}
      />
      <Rail historyCount={state.history.length} onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })} onHistory={() => setPanel("history")} onHelp={() => setPanel("help")} />

      <main className="workspace">
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
                Add the keys to <code>.env</code> (see <code>.env.example</code>); the server restarts on its own.
              </span>
            </div>
          </div>
        )}

        <div className="side">
          <AudioSourceCard
            source={source}
            onSource={setSource}
            session={state.session}
            starting={starting}
            canStart={connected && Boolean(state.info?.stt.ready)}
            levelRef={levelRef}
            onStart={start}
            onStop={cue.stop}
            onForce={cue.forceAnswer}
            onHelp={() => setPanel("help")}
          />
          <ContextCard context={context} onChange={saveContext} onEdit={() => setPanel("context")} onError={(m) => cue.notifyError(m)} />
        </div>

        <TranscriptPanel turns={state.turns} listening={running} canAsk={llmReady} onClear={cue.clearTranscript} onAsk={cue.ask} />

        <div className="answer-col">
          <QuestionCard question={state.question} />
          <AnswerCard answer={state.answer} question={state.question} canRegenerate={llmReady} onCancel={cue.cancelAnswer} onCopy={copy} onRegenerate={cue.regenerate} />
        </div>

        <MetricsBar metrics={state.answer?.metrics ?? null} all={metricsHistory} />
      </main>

      <Toasts toasts={state.toasts} onDismiss={cue.dismissToast} />
      {panel === "context" && <ContextDrawer initial={context} onSave={saveContext} onClose={() => setPanel(null)} />}
      {panel === "history" && <HistoryDrawer history={state.history} memoryTurns={state.info?.memoryTurns ?? 4} onReset={cue.resetMemory} onClose={() => setPanel(null)} />}
      {panel === "help" && <HelpDrawer onClose={() => setPanel(null)} />}
    </div>
  );
}
