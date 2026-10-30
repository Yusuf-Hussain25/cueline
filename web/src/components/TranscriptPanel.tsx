"use client";

import { AudioLines, CircleSlash, Hourglass, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LIMITS } from "@cueline/shared";
import { formatClock } from "@/lib/format";
import type { Turn } from "@/lib/sessionState";

const FLAG_ICON = { ignored: CircleSlash, pending: Hourglass, question: Sparkles } as const;

export function TranscriptPanel({
  turns,
  listening,
  canAsk,
  onClear,
  onAsk,
}: {
  turns: Turn[];
  listening: boolean;
  canAsk: boolean;
  onClear: () => void;
  onAsk: (text: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [typed, setTyped] = useState("");

  // Follow new text unless the user scrolled up to reread something
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <section className="card transcript" aria-label="Live transcript">
      <div className="card-head">
        <h2 className="card-title">
          <span className="ico">
            <AudioLines size={17} />
          </span>
          Live Transcript
        </h2>
        <span className="spacer" />
        {listening ? (
          <span className="chip green">
            <span className="dot" /> Live
          </span>
        ) : (
          <span className="chip muted">Paused</span>
        )}
        <button type="button" className="btn btn-sm" onClick={onClear} disabled={turns.length === 0}>
          <Trash2 size={15} /> Clear
        </button>
      </div>

      <div
        className="transcript-body"
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {turns.length === 0 ? (
          <div className="empty">
            <span className="ico">
              <AudioLines size={24} />
            </span>
            <strong>{listening ? "Listening for the interviewer…" : "Nothing heard yet"}</strong>
            <span>{listening ? "Words appear here as they're spoken. Grey text is still being recognised." : "Press Start Listening and share the meeting tab. Each interviewer turn shows up here."}</span>
          </div>
        ) : (
          turns.map((turn) => {
            const Icon = turn.flag ? FLAG_ICON[turn.flag.tone] : null;
            return (
              <div className="msg" key={turn.id}>
                <time dateTime={new Date(turn.at).toISOString()}>{formatClock(turn.at)}</time>
                <div className={`bubble${turn.flag?.tone === "question" ? " question" : ""}`}>
                  <span className="who">Interviewer</span>
                  {turn.parts.map((p) => (
                    <span key={p.segmentId} className={p.isFinal ? undefined : "interim"}>
                      {p.text}{" "}
                    </span>
                  ))}
                  {turn.flag && Icon && (
                    <div className={`flag ${turn.flag.tone}`}>
                      <Icon size={13} /> {turn.flag.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {listening && turns.length > 0 && (
          <div className="listening-row" aria-hidden="true">
            <span className="wave" style={{ color: "var(--text-3)" }}>
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            Listening…
          </div>
        )}
      </div>

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          const text = typed.trim();
          if (!text) return;
          onAsk(text);
          setTyped("");
        }}
      >
        <input
          className="input"
          value={typed}
          maxLength={LIMITS.questionChars}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type a question to test an answer…"
          aria-label="Type a question"
          disabled={!canAsk}
        />
        <button type="submit" className="btn btn-primary icon-btn" disabled={!typed.trim() || !canAsk} aria-label="Ask">
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}
