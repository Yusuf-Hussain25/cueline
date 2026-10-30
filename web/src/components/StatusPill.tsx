import type { SessionState } from "@cueline/shared";
import type { Connection } from "@/lib/sessionState";

const LABELS: Record<SessionState, { label: string; hint: string }> = {
  idle: { label: "Idle", hint: "press Start" },
  connecting: { label: "Connecting", hint: "opening stream" },
  listening: { label: "Listening", hint: "waiting for a question" },
  thinking: { label: "Thinking", hint: "question detected" },
  answering: { label: "Answering", hint: "streaming" },
};

export function StatusPill({ state, connection }: { state: SessionState; connection: Connection }) {
  const offline = connection !== "open";
  const { label, hint } = offline ? { label: "Offline", hint: connection === "connecting" ? "connecting to server" : "server unreachable" } : LABELS[state];
  return (
    <div className="status" data-state={offline ? "idle" : state} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      <span>{label}</span>
      <small className="hide-sm">{hint}</small>
    </div>
  );
}
