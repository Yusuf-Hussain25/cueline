"use client";

import { AudioLines, CircleSlash, Eraser, Hourglass, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TranscriptItem } from "@/lib/sessionState";

const NOTE_ICON = { ignored: CircleSlash, pending: Hourglass, question: Sparkles } as const;

export function TranscriptPanel({ items, listening, onClear }: { items: TranscriptItem[]; listening: boolean; onClear: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Follow new text unless the user scrolled up to reread something
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  return (
    <section className="panel transcript" aria-label="Live transcript">
      <div className="panel-head">
        <h2 className="panel-title">
          <AudioLines size={15} /> Live transcript
        </h2>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={items.length === 0} aria-label="Clear transcript">
          <Eraser size={14} /> Clear
        </button>
      </div>
      <div
        className="transcript-body"
        ref={bodyRef}
        aria-live="off"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {items.length === 0 ? (
          <div className="empty">
            <AudioLines size={26} />
            <strong>{listening ? "Listening…" : "Nothing heard yet"}</strong>
            <span>{listening ? "Words appear here as the interviewer speaks. Grey text is still being recognised." : "Press Start and share the meeting tab. The interviewer's words stream in here."}</span>
          </div>
        ) : (
          items.map((item) => {
            if (item.kind === "speech") {
              return (
                <p key={item.id} className={`line${item.isFinal ? "" : " interim"}`}>
                  {item.text}
                </p>
              );
            }
            const Icon = NOTE_ICON[item.tone];
            return (
              <div key={item.id} className={`note ${item.tone}`}>
                <Icon size={13} /> {item.text}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
