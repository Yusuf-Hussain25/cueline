// Provider-neutral LLM contract: streaming for answers, one short JSON completion for classification.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamOptions {
  signal: AbortSignal;
  maxTokens: number;
  temperature: number;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  readonly classifierModel: string;
  /** Yields text deltas as the model produces them. Stops early when `signal` aborts. */
  stream: (messages: ChatMessage[], options: StreamOptions) => AsyncIterable<string>;
  /** Small, fast JSON completion on the classifier model. Returns the raw JSON text. */
  completeJson: (messages: ChatMessage[], options: { signal: AbortSignal; maxTokens: number }) => Promise<string>;
}

/** An LLM failure with a message a candidate can act on. */
export class LlmError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

export const isAbortError = (err: unknown) =>
  err instanceof Error && (err.name === "AbortError" || err.name === "APIUserAbortError" || /abort/i.test(err.message));
