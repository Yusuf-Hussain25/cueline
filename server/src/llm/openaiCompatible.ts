import OpenAI from "openai";
import { LlmError, type ChatMessage, type LlmClient } from "./types.ts";

// One adapter for every provider that speaks the OpenAI Chat Completions API: Groq, OpenAI and
// DeepSeek differ only in base URL, key and model names.

export type OpenAiCompatibleProvider = "groq" | "openai" | "deepseek";

const PROVIDERS: Record<OpenAiCompatibleProvider, { label: string; baseURL?: string; keyVar: string; modelVar: string }> = {
  // Groq runs open models on custom inference chips: first tokens in a few hundred ms
  groq: { label: "Groq", baseURL: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL" },
  openai: { label: "OpenAI", keyVar: "OPENAI_API_KEY", modelVar: "OPENAI_MODEL" },
  deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com", keyVar: "DEEPSEEK_API_KEY", modelVar: "DEEPSEEK_MODEL" },
};

const describe = (err: unknown, provider: OpenAiCompatibleProvider): LlmError => {
  const { label, keyVar, modelVar } = PROVIDERS[provider];
  if (err instanceof OpenAI.AuthenticationError) return new LlmError(`${label} rejected the API key. Check ${keyVar} in .env.`, 401);
  if (err instanceof OpenAI.RateLimitError) return new LlmError(`${label} rate limit or quota reached. Wait a moment, or check billing.`, 429);
  if (err instanceof OpenAI.NotFoundError) return new LlmError(`${label} doesn't know that model. Check ${modelVar} in .env.`, 404);
  if (err instanceof OpenAI.APIConnectionError) return new LlmError(`Couldn't reach ${label}. Check your connection.`);
  if (err instanceof OpenAI.APIError) return new LlmError(`${label}: ${err.message}`, err.status ?? null);
  return new LlmError(err instanceof Error ? err.message : String(err));
};

export const createOpenAiCompatibleClient = ({
  provider,
  apiKey,
  model,
  classifierModel,
}: {
  provider: OpenAiCompatibleProvider;
  apiKey: string;
  model: string;
  classifierModel: string;
}): LlmClient => {
  // Retries would hide a slow provider behind more latency; fail fast and tell the user instead
  const client = new OpenAI({ apiKey, baseURL: PROVIDERS[provider].baseURL, maxRetries: 0, timeout: 20000 });
  // OpenAI's newer models take max_completion_tokens; Groq and DeepSeek use max_tokens
  const limit = (n: number) => (provider === "openai" ? { max_completion_tokens: n } : { max_tokens: n });

  return {
    provider,
    model,
    classifierModel,

    async *stream(messages: ChatMessage[], { signal, maxTokens, temperature }) {
      try {
        const stream = await client.chat.completions.create({ model, messages, stream: true, temperature, ...limit(maxTokens) }, { signal });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) yield delta;
        }
      } catch (err) {
        if (signal.aborted) return;
        throw describe(err, provider);
      }
    },

    async completeJson(messages, { signal, maxTokens }) {
      try {
        const res = await client.chat.completions.create(
          { model: classifierModel, messages, temperature: 0, response_format: { type: "json_object" }, ...limit(maxTokens) },
          { signal },
        );
        return res.choices[0]?.message?.content ?? "";
      } catch (err) {
        throw describe(err, provider);
      }
    },
  };
};
