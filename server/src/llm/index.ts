import type { LlmConfig } from "../config.ts";
import { createAnthropicClient } from "./anthropic.ts";
import { createGeminiClient } from "./gemini.ts";
import { createOpenAiCompatibleClient } from "./openaiCompatible.ts";
import type { LlmClient } from "./types.ts";

/** Builds the configured client, or null when its API key is missing. */
export const createLlmClient = (config: LlmConfig): LlmClient | null => {
  if (!config.apiKey) return null;
  const options = { apiKey: config.apiKey, model: config.model, classifierModel: config.classifierModel };
  switch (config.provider) {
    case "anthropic":
      return createAnthropicClient(options);
    case "gemini":
      return createGeminiClient(options);
    case "groq":
    case "openai":
    case "deepseek":
      return createOpenAiCompatibleClient({ provider: config.provider, ...options });
  }
};
