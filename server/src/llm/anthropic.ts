import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type ChatMessage, type LlmClient } from "./types.ts";

// Claude through the official SDK. Two latency choices:
//   - Answers run at effort "low": thinking can't be switched off on current Opus models, but low
//     effort keeps it brief, so the first token arrives quickly.
//   - The classifier runs on Haiku with thinking disabled: it only has to say yes or no.
// The server-side fallback re-runs a request on another model if one declines it, so a live
// interview never ends up with no answer. Sampling parameters (temperature) are no longer accepted.

const describe = (err: unknown): LlmError => {
  if (err instanceof Anthropic.AuthenticationError) return new LlmError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.", 401);
  if (err instanceof Anthropic.RateLimitError) return new LlmError("Claude rate limit reached. Wait a moment and try again.", 429);
  if (err instanceof Anthropic.NotFoundError) return new LlmError("Anthropic doesn't know that model. Check ANTHROPIC_MODEL in .env.", 404);
  if (err instanceof Anthropic.BadRequestError) return new LlmError(`Claude couldn't run this request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new LlmError("Couldn't reach Claude. Check your connection.");
  if (err instanceof Anthropic.APIError) return new LlmError(`Claude: ${err.message}`, err.status ?? null);
  return new LlmError(err instanceof Error ? err.message : String(err));
};

/** Claude takes the system prompt separately from the conversation. */
const split = (messages: ChatMessage[]) => ({
  system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
  turns: messages
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content })),
});

export const createAnthropicClient = ({ apiKey, model, classifierModel }: { apiKey: string; model: string; classifierModel: string }): LlmClient => {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 20000 });

  return {
    provider: "anthropic",
    model,
    classifierModel,

    async *stream(messages, { signal, maxTokens }) {
      const { system, turns } = split(messages);
      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: maxTokens,
            system,
            messages: turns,
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { signal },
        );
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
        }
      } catch (err) {
        if (signal.aborted) return;
        throw describe(err);
      }
    },

    async completeJson(messages, { signal, maxTokens }) {
      const { system, turns } = split(messages);
      try {
        const res = await client.messages.create(
          {
            model: classifierModel,
            max_tokens: Math.max(maxTokens, 256),
            system,
            messages: turns,
            thinking: { type: "disabled" },
            output_config: { effort: "low" },
          },
          { signal },
        );
        return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      } catch (err) {
        throw describe(err);
      }
    },
  };
};
