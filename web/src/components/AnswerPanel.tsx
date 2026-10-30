import { AudioLines, Copy, RotateCcw, Sparkles, Square, WandSparkles } from "lucide-react";
import type { DetectionPath } from "@cueline/shared";
import { formatClock } from "@/lib/format";
import type { Answer, Question } from "@/lib/sessionState";

const PATH_LABEL: Record<DetectionPath, string> = {
  heuristic: "Auto-detected",
  classifier: "AI-verified",
  forced: "Answer now",
  typed: "Typed",
  regenerated: "Regenerated",
};

/** Splits the streamed text into the opening sentence and bullets, tolerating partial lines. */
export const parseAnswer = (text: string) => {
  const lead: string[] = [];
  const bullets: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s*(.*)$/);
    if (bullet) bullets.push(bullet[1].replace(/\*\*/g, ""));
    else if (bullets.length === 0) lead.push(line.replace(/\*\*/g, ""));
    else bullets[bullets.length - 1] += ` ${line}`;
  }
  return { lead: lead.join(" "), bullets };
};

export function QuestionCard({ question }: { question: Question | null }) {
  return (
    <section className="card question-card" aria-label="Detected question">
      <div className="card-head">
        <h2 className="card-title">
          <span className="ico">
            <Sparkles size={17} />
          </span>
          Detected Question
        </h2>
        <span className="spacer" />
        {question && <span className="chip">{PATH_LABEL[question.path]}</span>}
      </div>
      <div className="body">
        {question ? (
          <>
            <p className="question-text" key={question.id}>
              {question.text}
            </p>
            <time dateTime={new Date(question.at).toISOString()}>{formatClock(question.at)}</time>
          </>
        ) : (
          <p className="question-text placeholder">Questions appear here the moment the interviewer finishes asking. Greetings and small talk are skipped.</p>
        )}
      </div>
    </section>
  );
}

export function AnswerCard({
  answer,
  question,
  canRegenerate,
  onCancel,
  onCopy,
  onRegenerate,
}: {
  answer: Answer | null;
  question: Question | null;
  canRegenerate: boolean;
  onCancel: () => void;
  onCopy: (text: string) => void;
  onRegenerate: (question: string) => void;
}) {
  const live = Boolean(answer && !answer.done);
  const { lead, bullets } = parseAnswer(answer?.text ?? "");
  const waiting = live && !answer?.text;

  return (
    <section className="card answer-card" aria-label="Suggested answer" aria-busy={live}>
      <div className="card-head">
        <h2 className="card-title">
          <span className="ico">
            <WandSparkles size={17} />
          </span>
          AI Suggested Answer
        </h2>
        <span className="spacer" />
        {live && (
          <span className="chip">
            <AudioLines size={14} /> {waiting ? "Thinking…" : "Streaming…"}
          </span>
        )}
        {answer?.done && answer.cancelled && <span className="chip amber">Stopped</span>}
      </div>

      {!answer ? (
        <div className="empty" style={{ flex: 1 }}>
          <span className="ico">
            <WandSparkles size={24} />
          </span>
          <strong>Your answer streams in here</strong>
          <span>A short opening line and 3 to 5 points, written from your resume, ready to say out loud.</span>
        </div>
      ) : waiting ? (
        <div className="answer-body" aria-label="Generating answer">
          <div className="skeleton" style={{ height: 20, width: "86%", marginBottom: 18 }} />
          {[72, 80, 64].map((w) => (
            <div key={w} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div className="skeleton" style={{ height: 30, width: 30, borderRadius: "50%" }} />
              <div className="skeleton" style={{ height: 18, width: `${w}%`, marginTop: 6 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="answer-body">
          {lead && (
            <p className="answer-lead">
              {lead}
              {live && bullets.length === 0 && <span className="caret" aria-hidden="true" />}
            </p>
          )}
          {bullets.length > 0 && (
            <ol className="answer-list">
              {bullets.map((b, i) => (
                <li key={i}>
                  <span>
                    {b}
                    {live && i === bullets.length - 1 && <span className="caret" aria-hidden="true" />}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {!lead && bullets.length === 0 && answer.done && <p style={{ color: "var(--text-3)" }}>No answer was generated.</p>}
        </div>
      )}

      {answer && (
        <div className="answer-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={!live}>
            <Square size={14} fill="currentColor" /> <span>Stop</span>
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => onCopy(answer.text.trim())} disabled={!answer.text.trim()}>
            <Copy size={16} /> <span>Copy</span>
          </button>
          <button type="button" className="btn" onClick={() => question && onRegenerate(question.text)} disabled={!question || live || !canRegenerate}>
            <RotateCcw size={16} /> <span>Regenerate</span>
          </button>
        </div>
      )}
    </section>
  );
}
