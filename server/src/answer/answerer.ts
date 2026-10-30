import type { CandidateContext } from "@cueline/shared";
import type { LlmClient } from "../llm/types.ts";
import { buildAnswerMessages, buildClassifierMessages, parseClassifierReply, type MemoryTurn } from "./prompts.ts";

// Generates answers and remembers recent ones (conversation memory), one instance per session.

/** ~90 words is ~130 tokens; the cap stops a runaway essay with room to spare for a normal answer. */
const MAX_ANSWER_TOKENS = 320;

export interface AnswerResult {
  text: string;
  /** Wall-clock time of the first token, or null if none arrived. */
  firstTokenAt: number | null;
  doneAt: number;
  cancelled: boolean;
}

export class Answerer {
  private memory: MemoryTurn[] = [];
  private readonly llm: LlmClient;
  private readonly memoryTurns: number;

  constructor(llm: LlmClient, memoryTurns: number) {
    this.llm = llm;
    this.memoryTurns = memoryTurns;
  }

  async answer({
    question,
    preamble,
    context,
    signal,
    onDelta,
  }: {
    question: string;
    preamble: string | null;
    context: CandidateContext;
    signal: AbortSignal;
    onDelta: (delta: string) => void;
  }): Promise<AnswerResult> {
    const messages = buildAnswerMessages({ context, memory: this.memory, question, preamble });
    let text = "";
    let firstTokenAt: number | null = null;

    for await (const delta of this.llm.stream(messages, { signal, maxTokens: MAX_ANSWER_TOKENS, temperature: 0.4 })) {
      if (signal.aborted) break;
      firstTokenAt ??= Date.now();
      text += delta;
      onDelta(delta);
    }

    const cancelled = signal.aborted;
    // Half an answer would mislead follow-ups, so only finished answers are remembered
    if (!cancelled && text.trim()) this.remember({ question, answer: text.trim() });
    return { text, firstTokenAt, doneAt: Date.now(), cancelled };
  }

  /** True when the classifier thinks the turn expects an answer. */
  async isQuestion(text: string, signal: AbortSignal): Promise<boolean> {
    const raw = await this.llm.completeJson(buildClassifierMessages(text), { signal, maxTokens: 20 });
    return parseClassifierReply(raw);
  }

  clearMemory() {
    this.memory = [];
  }

  private remember(turn: MemoryTurn) {
    if (this.memoryTurns === 0) return;
    this.memory.push(turn);
    if (this.memory.length > this.memoryTurns) this.memory.splice(0, this.memory.length - this.memoryTurns);
  }
}
