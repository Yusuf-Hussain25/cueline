import { ChevronRight, CircleHelp, History, RotateCcw } from "lucide-react";
import { formatClock, formatMs } from "@/lib/format";
import type { HistoryEntry } from "@/lib/sessionState";
import { Drawer } from "./ui/Drawer";

/** Earlier Q&A. The server sends the most recent ones with each new question (conversation memory). */
export function HistoryDrawer({ history, memoryTurns, onReset, onClose }: { history: HistoryEntry[]; memoryTurns: number; onReset: () => void; onClose: () => void }) {
  return (
    <Drawer
      title="History & memory"
      subtitle={`The last ${memoryTurns} answers go with each new question, so follow-ups like “can you go deeper?” make sense.`}
      icon={<History size={17} />}
      onClose={onClose}
      footer={
        <>
          <span style={{ fontSize: 13, color: "var(--text-3)", alignSelf: "center" }}>
            {history.length} answered · {Math.min(history.length, memoryTurns)} in memory
          </span>
          <button type="button" className="btn" onClick={onReset} disabled={history.length === 0}>
            <RotateCcw size={15} /> Forget all
          </button>
        </>
      }
    >
      {history.length === 0 ? (
        <div className="empty">
          <span className="ico">
            <History size={24} />
          </span>
          <strong>No earlier answers yet</strong>
          <span>Each answered question moves here when the next one arrives.</span>
        </div>
      ) : (
        history.map(({ question, answer }, i) => (
          <details className="history-item" key={question.id} open={i === 0}>
            <summary>
              <ChevronRight size={16} className="chev" />
              <span className="q">{question.text}</span>
              {i < memoryTurns && <span className="chip">in memory</span>}
              <span className="chip muted">{formatMs(answer.metrics?.endToEndMs ?? answer.metrics?.ttftMs)}</span>
            </summary>
            <div className="body">
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginBottom: 6 }}>{formatClock(question.at)}</div>
              {answer.text.trim()}
            </div>
          </details>
        ))
      )}
    </Drawer>
  );
}

export function HelpDrawer({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="How Cueline works" subtitle="Audio → live transcript → question detection → streamed answer." icon={<CircleHelp size={17} />} onClose={onClose}>
      <ol className="steps">
        <li>
          <span>
            <strong>Add your resume and the job description.</strong> Upload a PDF or paste text. Answers only use experience that&apos;s in your resume.
          </span>
        </li>
        <li>
          <span>
            <strong>Press Start Listening and pick the meeting tab.</strong> In Chrome&apos;s share dialog, choose the Google Meet or Zoom tab and keep “Share tab audio” on. Only the interviewer is captured,
            because the meeting doesn&apos;t play your own voice back to you.
          </span>
        </li>
        <li>
          <span>
            <strong>Talk as usual.</strong> Greetings, small talk and “great, thanks” are skipped. When a question ends, it appears at the top and the answer streams in within about two seconds.
          </span>
        </li>
        <li>
          <span>
            <strong>Missed one?</strong> Press <em>Answer now</em> to answer whatever was just said, or type a question under the transcript.
          </span>
        </li>
        <li>
          <span>
            <strong>Follow-ups work.</strong> Recent answers are kept in memory, so “can you go deeper on that?” builds on the last answer. Clear it from History.
          </span>
        </li>
      </ol>
      <p style={{ fontSize: 13.5, color: "var(--text-3)", lineHeight: 1.6, margin: 0 }}>
        Microphone mode works too, but it also hears you and any speaker echo, so use the meeting tab when you can.
      </p>
    </Drawer>
  );
}
