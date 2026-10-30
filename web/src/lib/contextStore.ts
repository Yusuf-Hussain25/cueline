import type { CandidateContext } from "@cueline/shared";

// Resume + JD remembered in this browser only (a per-viewer convenience; nothing is stored server-side).
const KEY = "cueline-context";

export interface FileMeta {
  name: string;
  size: number;
}

export interface StoredContext extends CandidateContext {
  /** Set when the text came from an uploaded file, so the card can show its name. */
  resumeFile: FileMeta | null;
  jdFile: FileMeta | null;
}

const EMPTY: StoredContext = { resume: "", jobDescription: "", resumeFile: null, jdFile: null };

let cachedRaw: string | null | undefined;
let cachedValue: StoredContext = EMPTY;
const listeners = new Set<() => void>();

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const meta = (value: unknown): FileMeta | null => {
  const v = value as Partial<FileMeta> | null | undefined;
  return v && typeof v.name === "string" && typeof v.size === "number" ? { name: v.name, size: v.size } : null;
};

export const contextStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** Same object until the stored value changes, as useSyncExternalStore requires. */
  get(): StoredContext {
    const raw = read() ?? cachedRaw ?? null;
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        const parsed = raw ? (JSON.parse(raw) as Partial<StoredContext>) : null;
        cachedValue = {
          resume: String(parsed?.resume ?? ""),
          jobDescription: String(parsed?.jobDescription ?? ""),
          resumeFile: meta(parsed?.resumeFile),
          jdFile: meta(parsed?.jdFile),
        };
      } catch {
        cachedValue = EMPTY;
      }
    }
    return cachedValue;
  },
  getServer: (): StoredContext => EMPTY,
  set(value: StoredContext) {
    const raw = JSON.stringify(value);
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      // storage blocked: keep it in memory for this visit
      cachedRaw = raw;
      cachedValue = value;
    }
    listeners.forEach((l) => l());
  },
};

/** Only the fields the server needs. */
export const toCandidateContext = (c: StoredContext): CandidateContext => ({ resume: c.resume, jobDescription: c.jobDescription });
