import type { AnswerMetrics, DetectionPath, ServerInfo, ServerMessage, SessionState } from "@cueline/shared";

// Everything the screen shows, derived only from server messages plus a few local events.
// Kept as a pure reducer so the UI logic is easy to follow and test.

export type Connection = "connecting" | "open" | "closed";

export type TranscriptItem =
  | { kind: "speech"; id: string; text: string; isFinal: boolean }
  | { kind: "note"; id: string; tone: "ignored" | "pending" | "question"; text: string };

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
}

export interface ViewState {
  connection: Connection;
  info: ServerInfo | null;
  session: SessionState;
  transcript: TranscriptItem[];
  question: Question | null;
  answer: Answer | null;
  history: HistoryEntry[];
  toasts: Toast[];
}

export type Action =
  | { type: "server"; message: ServerMessage }
  | { type: "connection"; connection: Connection }
  | { type: "toast"; message: string }
  | { type: "dismiss"; id: number }
  | { type: "clear_transcript" };

export const initialState: ViewState = {
  connection: "connecting",
  info: null,
  session: "idle",
  transcript: [],
  question: null,
  answer: null,
  history: [],
  toasts: [],
};

const MAX_TRANSCRIPT_ITEMS = 300;
let toastId = 0;

const pushTranscript = (items: TranscriptItem[], item: TranscriptItem) => {
  const next = [...items, item];
  return next.length > MAX_TRANSCRIPT_ITEMS ? next.slice(next.length - MAX_TRANSCRIPT_ITEMS) : next;
};

const addToast = (state: ViewState, message: string): ViewState => {
  // The same error twice in a row (e.g. rate limit) shouldn't stack up
  if (state.toasts.some((t) => t.message === message)) return state;
  return { ...state, toasts: [...state.toasts.slice(-2), { id: ++toastId, message }] };
};

const reduceServer = (state: ViewState, msg: ServerMessage): ViewState => {
  switch (msg.type) {
    case "ready":
      return { ...state, info: msg.info };
    case "state":
      return { ...state, session: msg.state };
    case "transcript": {
      const index = state.transcript.findIndex((t) => t.kind === "speech" && t.id === msg.segmentId);
      const item: TranscriptItem = { kind: "speech", id: msg.segmentId, text: msg.text, isFinal: msg.isFinal };
      if (index === -1) return { ...state, transcript: pushTranscript(state.transcript, item) };
      const transcript = state.transcript.slice();
      transcript[index] = item;
      return { ...state, transcript };
    }
    case "ignored":
      return {
        ...state,
        transcript: pushTranscript(state.transcript, { kind: "note", id: `n${msg.at}-${Math.random()}`, tone: "ignored", text: `Skipped: ${msg.reason}` }),
      };
    case "pending":
      return {
        ...state,
        transcript: pushTranscript(state.transcript, { kind: "note", id: `n${msg.at}-${Math.random()}`, tone: "pending", text: "Sounds unfinished, waiting for the rest…" }),
      };
    case "question": {
      // Archive the previous finished answer so memory is visible in the UI
      const history =
        state.question && state.answer && state.answer.done && state.answer.text.trim() && !state.history.some((h) => h.question.id === state.question!.id)
          ? [{ question: state.question, answer: state.answer }, ...state.history]
          : state.history;
      return {
        ...state,
        history,
        question: { id: msg.id, text: msg.text, path: msg.path, at: msg.at },
        answer: { id: msg.id, text: "", done: false, cancelled: false, metrics: null },
        transcript: pushTranscript(state.transcript, { kind: "note", id: `q${msg.id}`, tone: "question", text: "Question detected" }),
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
      return addToast(state, action.message);
    case "dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "clear_transcript":
      return { ...state, transcript: [] };
  }
};
