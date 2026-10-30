import { CircleHelp, History, House } from "lucide-react";

/** Side navigation (a bottom bar on phones). Every item opens something real. */
export function Rail({ historyCount, onHome, onHistory, onHelp }: { historyCount: number; onHome: () => void; onHistory: () => void; onHelp: () => void }) {
  return (
    <nav className="rail" aria-label="Main">
      <button type="button" aria-current="page" onClick={onHome}>
        <House size={22} />
        Interview
      </button>
      <button type="button" onClick={onHistory} aria-label={`History, ${historyCount} answered questions`}>
        <History size={22} />
        History
        {historyCount > 0 && <span className="badge">{historyCount}</span>}
      </button>
      <button type="button" onClick={onHelp}>
        <CircleHelp size={22} />
        Help
      </button>
    </nav>
  );
}
