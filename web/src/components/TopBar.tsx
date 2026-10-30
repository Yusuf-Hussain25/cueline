import { Cpu, FileText } from "lucide-react";
import type { ServerInfo, SessionState } from "@cueline/shared";
import { prettyModel } from "@/lib/format";
import type { Connection } from "@/lib/sessionState";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./ui/Logo";

const STATUS: Record<SessionState, { label: string; hint?: string }> = {
  idle: { label: "Ready", hint: "press Start listening" },
  connecting: { label: "Connecting…" },
  listening: { label: "Listening…" },
  thinking: { label: "Thinking…", hint: "question detected" },
  answering: { label: "Answering…", hint: "streaming" },
};

export function StatusPill({ state, connection }: { state: SessionState; connection: Connection }) {
  const offline = connection !== "open";
  const { label, hint } = offline ? { label: connection === "connecting" ? "Connecting to server…" : "Server offline", hint: undefined } : STATUS[state];
  return (
    <div className="status" data-state={offline ? "idle" : state} role="status" aria-live="polite">
      <span className="wave" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
      {hint && <small className="hide-md">{hint}</small>}
    </div>
  );
}

export function TopBar({
  state,
  connection,
  info,
  hasContext,
  onOpenContext,
}: {
  state: SessionState;
  connection: Connection;
  info: ServerInfo | null;
  hasContext: boolean;
  onOpenContext: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <strong>Cueline</strong>
          <small>AI interview copilot</small>
        </div>
      </div>
      <StatusPill state={state} connection={connection} />
      <span className="spacer" />
      <div className="topbar-actions">
        {info && (
          <span className="provider hide-md" title={`Speech-to-text: ${info.stt.model} · Answers: ${info.llm.model}`}>
            <span className="ico">
              <Cpu size={15} />
            </span>
            {prettyModel(info.stt.provider, info.stt.model)} · {prettyModel(info.llm.provider, info.llm.model)}
          </span>
        )}
        <button type="button" className="btn" onClick={onOpenContext} aria-label="Edit resume and job description">
          <FileText size={17} />
          <span className="hide-md">{hasContext ? "Resume & JD" : "Add resume & JD"}</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
