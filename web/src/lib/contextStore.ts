import type { CandidateContext } from "@cueline/shared";

// Resume + JD remembered in this browser only (a per-viewer convenience; nothing is stored server-side).
const KEY = "cueline-context";
const EMPTY: CandidateContext = { resume: "", jobDescription: "" };

let cachedRaw: string | null | undefined;
let cachedValue: CandidateContext = EMPTY;
const listeners = new Set<() => void>();

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const contextStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** Same object until the stored value changes, as useSyncExternalStore requires. */
  get(): CandidateContext {
    const raw = read();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        const parsed = raw ? (JSON.parse(raw) as Partial<CandidateContext>) : null;
        cachedValue = { resume: String(parsed?.resume ?? ""), jobDescription: String(parsed?.jobDescription ?? "") };
      } catch {
        cachedValue = EMPTY;
      }
    }
    return cachedValue;
  },
  getServer: (): CandidateContext => EMPTY,
  set(value: CandidateContext) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // storage blocked: keep it in memory for this visit
      cachedRaw = JSON.stringify(value);
      cachedValue = value;
    }
    listeners.forEach((l) => l());
  },
};
