import { BarChart3, ChartColumnBig, Play, Search, Zap } from "lucide-react";
import type { AnswerMetrics } from "@cueline/shared";
import { formatMs, median } from "@/lib/format";

const TARGET_MS = 3000;

/**
 * Latency for the latest answer plus the session median. "End to end" runs from the end of the
 * interviewer's speech to the first answer token: the number the 3 s target is about.
 */
export function MetricsBar({ metrics, all }: { metrics: AnswerMetrics | null; all: AnswerMetrics[] }) {
  const e2e = all.map((m) => m.endToEndMs).filter((v): v is number => v !== null);
  const med = median(e2e);
  const within = e2e.filter((v) => v <= TARGET_MS).length;
  const over = (ms: number | null | undefined) => (ms != null && ms > TARGET_MS ? " over" : "");

  return (
    <section className="card metrics" aria-label="Real-time metrics">
      <div className="card-head">
        <h2 className="card-title">
          <span className="ico">
            <ChartColumnBig size={17} />
          </span>
          Real-time Metrics
        </h2>
        <span className="spacer" />
        <span className="chip muted">Target under 3s</span>
      </div>
      <div className="metrics-grid">
        <div className="metric purple">
          <Zap size={20} />
          <span>End-to-end</span>
          <strong className={over(metrics?.endToEndMs)}>{formatMs(metrics?.endToEndMs)}</strong>
          <small>Speech end → first word</small>
        </div>
        <div className="metric blue">
          <Search size={20} />
          <span>Detection</span>
          <strong>{formatMs(metrics?.detectMs)}</strong>
          <small>End of speech → detected</small>
        </div>
        <div className="metric green">
          <Play size={20} />
          <span>First token</span>
          <strong>{formatMs(metrics?.ttftMs)}</strong>
          <small>{metrics?.totalMs != null ? `Full answer in ${formatMs(metrics.totalMs)}` : "Detected → first token"}</small>
        </div>
        <div className="metric orange">
          <BarChart3 size={20} />
          <span>Session median</span>
          <strong className={over(med)}>{formatMs(med)}</strong>
          <small>{e2e.length ? `${within} of ${e2e.length} under 3s` : "No answers yet"}</small>
        </div>
      </div>
    </section>
  );
}
