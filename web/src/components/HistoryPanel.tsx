import { BrainCircuit, ChevronRight, RotateCcw } from "lucide-react";
import type { HistoryEntry } from "@/lib/sessionState";
import { formatMs, latencyTone } from "@/lib/format";

/** Earlier Q&A. The server sends the most recent ones with each new question (conversation memory). */
export function HistoryPanel({ history, memoryTurns, onReset }: { history: HistoryEntry[]; memoryTurns: number; onReset: () => void }) {
  return (
    <section className="panel history" aria-label="Earlier questions">
      <div className="panel-head">
        <h2 className="panel-title">
          <BrainCircuit size={15} /> Memory
        </h2>
        {history.length > 0 && (
          <span className="chip hide-sm" title="Earlier answers sent with each new question, so follow-ups make sense">
            last {Math.min(history.length, memoryTurns)} of {history.length} used for follow-ups
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset} disabled={history.length === 0} aria-label="Forget earlier questions">
          <RotateCcw size={14} /> Forget
        </button>
      </div>
      {history.length === 0 ? (
        <p className="hint" style={{ padding: "8px 18px 16px" }}>
          Answered questions collect here. Follow-ups like “can you go deeper on that?” use them as context.
        </p>
      ) : (
        <ul className="history-list">
          {history.map(({ question, answer }) => (
            <li key={question.id}>
              <details className="history-item">
                <summary>
                  <ChevronRight size={16} className="chev" />
                  <span className="q">{question.text}</span>
                  <span className={`chip ${latencyTone(answer.metrics?.endToEndMs)}`}>{formatMs(answer.metrics?.endToEndMs ?? answer.metrics?.ttftMs)}</span>
                </summary>
                <div className="body">{answer.text.trim()}</div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
