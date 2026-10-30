// The WebSocket contract between the browser and the server.
//
// Audio travels as binary frames: raw 16-bit little-endian PCM, mono, 16 kHz (see audio.ts).
// Everything else is a JSON text frame with a `type` field.

/** What the session is doing right now. Drives the status indicator. */
export type SessionState = "idle" | "connecting" | "listening" | "thinking" | "answering";

export interface CandidateContext {
  /** Resume or a short professional summary. */
  resume: string;
  /** The job description the candidate is interviewing for. */
  jobDescription: string;
}

// ---------- client → server ----------

export type ClientMessage =
  /** Opens the speech-to-text stream. Audio frames may follow immediately. */
  | { type: "start"; context: CandidateContext }
  /** Closes the speech-to-text stream and cancels any answer in progress. */
  | { type: "stop" }
  /** Replaces the resume / job description mid-session. */
  | { type: "context"; context: CandidateContext }
  /** Treats whatever the interviewer has said so far as a question, right now. */
  | { type: "force_answer" }
  /** Stops the answer that is streaming. */
  | { type: "cancel_answer" }
  /** Answers a typed question (handy when audio is unavailable), or re-answers one. */
  | { type: "ask"; text: string; regenerate?: boolean }
  /** Forgets earlier questions and answers. */
  | { type: "reset_memory" };

// ---------- server → client ----------

/** How a turn was classified. */
export type DetectionPath = "heuristic" | "classifier" | "forced" | "typed" | "regenerated";

/** Timings for one answer, all in milliseconds. */
export interface AnswerMetrics {
  /** End of the interviewer's speech → question detected (STT endpointing + detection). */
  detectMs: number | null;
  /** Question detected → first answer token (LLM time to first token). */
  ttftMs: number | null;
  /** End of speech → first answer token. The number the 3 s target applies to. */
  endToEndMs: number | null;
  /** End of speech → last answer token. */
  totalMs: number | null;
  /** Approximate output size. */
  words: number;
}

export interface ServerInfo {
  stt: { provider: string; model: string; ready: boolean };
  llm: { provider: string; model: string; classifierModel: string; ready: boolean };
  /** Earlier Q&A pairs sent with each new question. */
  memoryTurns: number;
  /** Human-readable configuration problems (missing keys etc). Empty when ready. */
  problems: string[];
}

export type ServerMessage =
  | { type: "ready"; info: ServerInfo }
  | { type: "state"; state: SessionState }
  /** A piece of transcript. Interim text for the same segment is replaced until isFinal. */
  | { type: "transcript"; segmentId: string; text: string; isFinal: boolean; at: number }
  /** The current turn closed but wasn't a question (small talk, filler, a statement). */
  | { type: "ignored"; text: string; reason: string; at: number }
  /** The turn looks unfinished; waiting a moment for the rest. */
  | { type: "pending"; text: string; at: number }
  | {
      type: "question";
      id: string;
      text: string;
      path: DetectionPath;
      at: number;
    }
  | { type: "answer_delta"; id: string; delta: string }
  | { type: "answer_done"; id: string; text: string; metrics: AnswerMetrics; cancelled: boolean }
  | { type: "memory_cleared" }
  | { type: "error"; code: ErrorCode; message: string; fatal: boolean };

export type ErrorCode =
  | "bad_request"
  | "not_configured"
  | "stt_failed"
  | "llm_failed"
  | "rate_limited"
  | "internal";
