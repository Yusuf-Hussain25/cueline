import type { AnswerMetrics } from "@cueline/shared";
import { formatMs, latencyTone, median } from "@/lib/format";

/**
 * Latency for the latest answer, plus the session median. "End to end" is measured from the end of
 * the interviewer's speech to the first answer token: the number the 3 s target is about.
 */
export function MetricsBar({ metrics, all }: { metrics: AnswerMetrics | null; all: AnswerMetrics[] }) {
  const e2e = all.map((m) => m.endToEndMs).filter((v): v is number => v !== null);
  const med = median(e2e);
  const within = e2e.filter((v) => v <= 3000).length;

  return (
    <section className="panel metrics" aria-label="Latency metrics">
      <div className={`metric ${latencyTone(metrics?.endToEndMs)}`}>
        <span>End to end</span>
        <strong>{formatMs(metrics?.endToEndMs)}</strong>
        <small>speech end → first word</small>
      </div>
      <div className="metric">
        <span>Detect</span>
        <strong>{formatMs(metrics?.detectMs)}</strong>
        <small>endpointing + rules</small>
      </div>
      <div className="metric">
        <span>First token</span>
        <strong>{formatMs(metrics?.ttftMs)}</strong>
        <small>LLM response</small>
      </div>
      <div className="metric">
        <span>Full answer</span>
        <strong>{formatMs(metrics?.totalMs)}</strong>
        <small>{metrics ? `${metrics.words} words` : "speech end → done"}</small>
      </div>
      <div className={`metric ${latencyTone(med)}`}>
        <span>Session median</span>
        <strong>{formatMs(med)}</strong>
        <small>{e2e.length ? `${within}/${e2e.length} under 3 s` : "no answers yet"}</small>
      </div>
    </section>
  );
}
