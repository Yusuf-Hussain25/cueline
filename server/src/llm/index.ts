import type { LlmConfig } from "../config.ts";
import { createGeminiClient } from "./gemini.ts";
import { createGroqClient } from "./groq.ts";
import type { LlmClient } from "./types.ts";

/** Builds the configured client, or null when its API key is missing. */
export const createLlmClient = (config: LlmConfig): LlmClient | null => {
  if (!config.apiKey) return null;
  const options = { apiKey: config.apiKey, model: config.model, classifierModel: config.classifierModel };
  return config.provider === "groq" ? createGroqClient(options) : createGeminiClient(options);
};
