import Groq from "groq-sdk";
import { LlmError, type ChatMessage, type LlmClient } from "./types.ts";

// Groq runs open models on custom inference hardware: time to first token is typically a few
// hundred milliseconds, which is most of what decides whether we beat the 3 s target.

const describe = (err: unknown, provider = "Groq"): LlmError => {
  if (err instanceof Groq.AuthenticationError) return new LlmError(`${provider} rejected the API key. Check GROQ_API_KEY in .env.`, 401);
  if (err instanceof Groq.RateLimitError) return new LlmError(`${provider} rate limit reached. Wait a moment and try again.`, 429);
  if (err instanceof Groq.NotFoundError) return new LlmError(`${provider} doesn't know that model. Check GROQ_MODEL in .env.`, 404);
  if (err instanceof Groq.APIConnectionError) return new LlmError(`Couldn't reach ${provider}. Check your connection.`);
  if (err instanceof Groq.APIError) return new LlmError(`${provider}: ${err.message}`, err.status ?? null);
  return new LlmError(err instanceof Error ? err.message : String(err));
};

export const createGroqClient = ({ apiKey, model, classifierModel }: { apiKey: string; model: string; classifierModel: string }): LlmClient => {
  // Retries would hide a slow provider behind more latency; fail fast and tell the user instead
  const client = new Groq({ apiKey, maxRetries: 0, timeout: 20000 });

  return {
    provider: "groq",
    model,
    classifierModel,

    async *stream(messages: ChatMessage[], { signal, maxTokens, temperature }) {
      let stream;
      try {
        stream = await client.chat.completions.create(
          { model, messages, stream: true, max_tokens: maxTokens, temperature },
          { signal },
        );
      } catch (err) {
        if (signal.aborted) return;
        throw describe(err);
      }
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) yield delta;
        }
      } catch (err) {
        if (signal.aborted) return;
        throw describe(err);
      }
    },

    async completeJson(messages, { signal, maxTokens }) {
      try {
        const res = await client.chat.completions.create(
          { model: classifierModel, messages, max_tokens: maxTokens, temperature: 0, response_format: { type: "json_object" } },
          { signal },
        );
        return res.choices[0]?.message?.content ?? "";
      } catch (err) {
        throw describe(err);
      }
    },
  };
};
