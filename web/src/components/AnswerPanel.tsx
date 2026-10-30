import { MessageCircleQuestion, Square, Wand2 } from "lucide-react";
import type { DetectionPath } from "@cueline/shared";
import type { Answer, Question } from "@/lib/sessionState";
import { formatAgo } from "@/lib/format";

const PATH_LABEL: Record<DetectionPath, string> = {
  heuristic: "auto · heuristics",
  classifier: "auto · AI classifier",
  forced: "answer now",
  typed: "typed",
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

export function QuestionCard({ question, now }: { question: Question | null; now: number }) {
  return (
    <section className="panel question-card" aria-label="Detected question">
      <div className="panel-head" style={{ padding: "14px 0 0" }}>
        <h2 className="panel-title">
          <MessageCircleQuestion size={15} /> Detected question
        </h2>
        <span className="spacer" />
        {question && (
          <>
            <span className="chip">{PATH_LABEL[question.path]}</span>
            <span className="chip hide-sm">{formatAgo(question.at, now)}</span>
          </>
        )}
      </div>
      {question ? (
        <p className="question-text">{question.text}</p>
      ) : (
        <p className="question-text" style={{ color: "var(--text-3)", fontWeight: 500, fontSize: 17 }}>
          Questions show up here the moment the interviewer finishes asking. Small talk is skipped.
        </p>
      )}
    </section>
  );
}

export function AnswerCard({ answer, onCancel }: { answer: Answer | null; onCancel: () => void }) {
  const live = Boolean(answer && !answer.done);
  const { lead, bullets } = parseAnswer(answer?.text ?? "");
  const waiting = live && !answer?.text;

  return (
    <section className="panel answer-card" data-live={live} aria-label="Suggested answer" aria-busy={live}>
      <div className="panel-head" style={{ padding: "14px 0 0" }}>
        <h2 className="panel-title">
          <Wand2 size={15} /> Suggested answer
        </h2>
        <span className="spacer" />
        {answer?.cancelled && answer.done && <span className="chip warn">stopped</span>}
        {live && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Stop this answer">
            <Square size={13} /> Stop
          </button>
        )}
      </div>

      {!answer ? (
        <div className="empty">
          <Wand2 size={26} />
          <strong>Your answer streams in here</strong>
          <span>A short opening line and 3–5 bullets, written from your resume, ready to say out loud.</span>
        </div>
      ) : waiting ? (
        <div className="answer" aria-label="Generating answer">
          <div className="skeleton" style={{ height: 22, width: "82%", marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 16, width: "64%", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 16, width: "72%", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 16, width: "56%" }} />
        </div>
      ) : (
        <div className="answer">
          {lead && (
            <p>
              {lead}
              {live && bullets.length === 0 && <span className="caret" aria-hidden="true" />}
            </p>
          )}
          {bullets.length > 0 && (
            <ul>
              {bullets.map((b, i) => (
                <li key={i}>
                  {b}
                  {live && i === bullets.length - 1 && <span className="caret" aria-hidden="true" />}
                </li>
              ))}
            </ul>
          )}
          {!lead && bullets.length === 0 && answer.done && <p style={{ color: "var(--text-3)", fontWeight: 450 }}>No answer was generated.</p>}
        </div>
      )}
    </section>
  );
}
