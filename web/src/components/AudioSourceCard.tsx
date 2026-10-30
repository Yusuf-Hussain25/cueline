import { AudioLines, CircleHelp, Mic, MonitorUp, Play, Square, Zap } from "lucide-react";
import type { SessionState } from "@cueline/shared";
import type { AudioSource } from "@/lib/audio";
import { LevelMeter } from "./LevelMeter";

const SOURCE_LABEL: Record<AudioSource, string> = { tab: "Meeting tab audio", mic: "Microphone" };

export function AudioSourceCard({
  source,
  onSource,
  session,
  starting,
  canStart,
  levelRef,
  onStart,
  onStop,
  onForce,
  onHelp,
}: {
  source: AudioSource;
  onSource: (s: AudioSource) => void;
  session: SessionState;
  starting: boolean;
  canStart: boolean;
  levelRef: React.RefObject<number>;
  onStart: () => void;
  onStop: () => void;
  onForce: () => void;
  onHelp: () => void;
}) {
  const running = session !== "idle";
  const busy = session === "thinking" || session === "answering";

  return (
    <section className="card audio-card" aria-label="Audio source">
      <div className="card-head">
        <h2 className="card-title">
          <span className="ico">
            <AudioLines size={17} />
          </span>
          Audio Source
        </h2>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost icon-btn btn-sm" onClick={onHelp} aria-label="How audio capture works">
          <CircleHelp size={18} />
        </button>
      </div>
      <div className="body">
        <div className="segmented" role="group" aria-label="Audio source">
          <button type="button" aria-pressed={source === "tab"} disabled={running} onClick={() => onSource("tab")}>
            <MonitorUp size={17} /> Meeting Tab
          </button>
          <button type="button" aria-pressed={source === "mic"} disabled={running} onClick={() => onSource("mic")}>
            <Mic size={17} /> Microphone
          </button>
        </div>

        {running ? (
          <button type="button" className="btn btn-primary btn-xl" onClick={onStop}>
            <Square size={17} fill="currentColor" /> Stop Listening
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-xl" onClick={onStart} disabled={!canStart || starting}>
            <Play size={18} fill="currentColor" /> {starting ? (source === "tab" ? "Choose the meeting tab…" : "Allow the microphone…") : "Start Listening"}
          </button>
        )}

        <LevelMeter levelRef={levelRef} active={running} />

        <div className="capture-row">
          <span className={`dot${running ? " live" : ""}`} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{session === "connecting" ? "Connecting…" : running ? "Capturing" : "Not capturing"}</strong>
            <span>{running ? SOURCE_LABEL[source] : source === "tab" ? "Share the Meet or Zoom tab with audio" : "Uses your default microphone"}</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={onForce} disabled={!running || busy} title="Answer what the interviewer has said so far">
            <Zap size={15} /> Answer now
          </button>
        </div>
      </div>
    </section>
  );
}
