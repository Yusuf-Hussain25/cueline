import type { AnswerMetrics, DetectionPath, ServerInfo, ServerMessage, SessionState } from "@cueline/shared";

// Everything the screen shows, derived only from server messages plus a few local events.
// Kept as a pure reducer so the UI logic is easy to follow and test.

export type Connection = "connecting" | "open" | "closed";

export interface TranscriptPart {
  segmentId: string;
  text: string;
  isFinal: boolean;
}

/** One interviewer turn: STT segments grouped until the detector decides what the turn was. */
export interface Turn {
  id: string;
  at: number;
  parts: TranscriptPart[];
  /** The detector's verdict, shown under the bubble. */
  flag: { tone: "ignored" | "pending" | "question"; text: string } | null;
  /** Closed turns take no more text; the next segment starts a new bubble. */
  closed: boolean;
}

export interface Question {
  id: string;
  text: string;
  path: DetectionPath;
  at: number;
}

export interface Answer {
  id: string;
  text: string;
  done: boolean;
  cancelled: boolean;
  metrics: AnswerMetrics | null;
}

export interface HistoryEntry {
  question: Question;
  answer: Answer;
}

export interface Toast {
  id: number;
  message: string;
  tone: "error" | "info";
}

export interface ViewState {
  connection: Connection;
  info: ServerInfo | null;
  session: SessionState;
  turns: Turn[];
  question: Question | null;
  answer: Answer | null;
  history: HistoryEntry[];
  toasts: Toast[];
}

export type Action =
  | { type: "server"; message: ServerMessage }
  | { type: "connection"; connection: Connection }
  | { type: "toast"; message: string; tone?: Toast["tone"] }
  | { type: "dismiss"; id: number }
  | { type: "clear_transcript" };

export const initialState: ViewState = {
  connection: "connecting",
  info: null,
  session: "idle",
  turns: [],
  question: null,
  answer: null,
  history: [],
  toasts: [],
};

const MAX_TURNS = 120;
let toastId = 0;

const addToast = (state: ViewState, message: string, tone: Toast["tone"] = "error"): ViewState => {
  // The same message twice in a row (e.g. rate limit) shouldn't stack up
  if (state.toasts.some((t) => t.message === message)) return state;
  return { ...state, toasts: [...state.toasts.slice(-2), { id: ++toastId, message, tone }] };
};

const upsertPart = (turns: Turn[], part: TranscriptPart, at: number): Turn[] => {
  const index = turns.findIndex((t) => t.parts.some((p) => p.segmentId === part.segmentId));
  if (index !== -1) {
    const turn = turns[index];
    const next = turns.slice();
    next[index] = { ...turn, parts: turn.parts.map((p) => (p.segmentId === part.segmentId ? part : p)) };
    return next;
  }
  const last = turns[turns.length - 1];
  if (last && !last.closed) return [...turns.slice(0, -1), { ...last, parts: [...last.parts, part] }];
  const next = [...turns, { id: part.segmentId, at, parts: [part], flag: null, closed: false }];
  return next.length > MAX_TURNS ? next.slice(next.length - MAX_TURNS) : next;
};

/** Marks the latest turn with the detector's verdict (and closes it unless still pending). */
const flagLast = (turns: Turn[], flag: NonNullable<Turn["flag"]>, close: boolean): Turn[] => {
  const last = turns[turns.length - 1];
  if (!last || last.closed) return turns;
  return [...turns.slice(0, -1), { ...last, flag, closed: close }];
};

const reduceServer = (state: ViewState, msg: ServerMessage): ViewState => {
  switch (msg.type) {
    case "ready":
      return { ...state, info: msg.info };
    case "state":
      return { ...state, session: msg.state };
    case "transcript":
      return { ...state, turns: upsertPart(state.turns, { segmentId: msg.segmentId, text: msg.text, isFinal: msg.isFinal }, msg.at) };
    case "ignored":
      return { ...state, turns: flagLast(state.turns, { tone: "ignored", text: `Skipped · ${msg.reason}` }, true) };
    case "pending":
      return { ...state, turns: flagLast(state.turns, { tone: "pending", text: "Sounds unfinished, waiting for the rest" }, false) };
    case "question": {
      // Archive the previous finished answer so memory is visible in the UI
      const prev = state.question;
      const history =
        prev && state.answer?.done && state.answer.text.trim() && !state.history.some((h) => h.question.id === prev.id)
          ? [{ question: prev, answer: state.answer }, ...state.history]
          : state.history;
      const fromSpeech = msg.path === "heuristic" || msg.path === "classifier" || msg.path === "forced";
      return {
        ...state,
        history,
        question: { id: msg.id, text: msg.text, path: msg.path, at: msg.at },
        answer: { id: msg.id, text: "", done: false, cancelled: false, metrics: null },
        turns: fromSpeech ? flagLast(state.turns, { tone: "question", text: "Question detected" }, true) : state.turns,
      };
    }
    case "answer_delta":
      if (state.answer?.id !== msg.id) return state;
      return { ...state, answer: { ...state.answer, text: state.answer.text + msg.delta } };
    case "answer_done":
      if (state.answer?.id !== msg.id) return state;
      return { ...state, answer: { ...state.answer, text: msg.text, done: true, cancelled: msg.cancelled, metrics: msg.metrics } };
    case "memory_cleared":
      return { ...state, history: [] };
    case "error":
      return addToast(state, msg.message);
  }
};

export const reducer = (state: ViewState, action: Action): ViewState => {
  switch (action.type) {
    case "server":
      return reduceServer(state, action.message);
    case "connection":
      return { ...state, connection: action.connection, session: action.connection === "open" ? state.session : "idle" };
    case "toast":
      return addToast(state, action.message, action.tone);
    case "dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "clear_transcript":
      return { ...state, turns: [] };
  }
};
