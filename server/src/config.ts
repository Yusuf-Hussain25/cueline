import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// One .env at the repo root configures everything. Real environment variables win over the file.
const envFile = resolve(import.meta.dirname, "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** LLM providers, in the order they're picked when LLM_PROVIDER is empty (fastest first). */
const PROVIDERS = ["groq", "anthropic", "openai", "gemini", "deepseek"] as const;
type Provider = (typeof PROVIDERS)[number];

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  DEEPGRAM_API_KEY: optional,
  DEEPGRAM_MODEL: z.string().default("nova-3"),
  DEEPGRAM_LANGUAGE: z.string().default("en"),
  /** Silence (ms) before Deepgram marks speech as finished. Lower is faster but cuts people off. */
  ENDPOINTING_MS: z.coerce.number().int().min(10).max(5000).default(500),
  /** Backup end-of-turn signal (ms) that fires even when background noise defeats endpointing. */
  UTTERANCE_END_MS: z.coerce.number().int().min(1000).max(5000).default(1000),

  // Empty means "pick automatically"
  LLM_PROVIDER: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.enum(PROVIDERS).optional()),
  GROQ_API_KEY: optional,
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GROQ_CLASSIFIER_MODEL: z.string().default("llama-3.1-8b-instant"),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),
  ANTHROPIC_CLASSIFIER_MODEL: z.string().default("claude-haiku-5-5"),
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_CLASSIFIER_MODEL: z.string().default("gpt-4.1-mini"),
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_CLASSIFIER_MODEL: z.string().default("gemini-2.5-flash-lite"),
  DEEPSEEK_API_KEY: optional,
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_CLASSIFIER_MODEL: z.string().default("deepseek-chat"),

  /** How many earlier question/answer pairs are sent with each new question. */
  MEMORY_TURNS: z.coerce.number().int().min(0).max(20).default(4),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  console.error(`Invalid configuration in .env:\n${lines.join("\n")}`);
  process.exit(1);
}
const env = parsed.data;

const LLM: Record<Provider, { apiKey?: string; model: string; classifierModel: string; keyVar: string }> = {
  groq: { apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL, classifierModel: env.GROQ_CLASSIFIER_MODEL, keyVar: "GROQ_API_KEY" },
  anthropic: { apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL, classifierModel: env.ANTHROPIC_CLASSIFIER_MODEL, keyVar: "ANTHROPIC_API_KEY" },
  openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, classifierModel: env.OPENAI_CLASSIFIER_MODEL, keyVar: "OPENAI_API_KEY" },
  gemini: { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, classifierModel: env.GEMINI_CLASSIFIER_MODEL, keyVar: "GEMINI_API_KEY" },
  deepseek: { apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL, classifierModel: env.DEEPSEEK_CLASSIFIER_MODEL, keyVar: "DEEPSEEK_API_KEY" },
};

// No LLM_PROVIDER set: use the first provider with a key, in rough order of time to first token
const llmProvider: Provider = env.LLM_PROVIDER ?? PROVIDERS.find((p) => LLM[p].apiKey) ?? "groq";
const { keyVar, ...llm } = LLM[llmProvider];

export const config = {
  port: env.PORT,
  allowedOrigins: env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  stt: {
    apiKey: env.DEEPGRAM_API_KEY,
    model: env.DEEPGRAM_MODEL,
    language: env.DEEPGRAM_LANGUAGE,
    endpointingMs: env.ENDPOINTING_MS,
    utteranceEndMs: env.UTTERANCE_END_MS,
  },
  llm: { provider: llmProvider, ...llm },
  memoryTurns: env.MEMORY_TURNS,
};

export type LlmConfig = typeof config.llm;

/** Missing keys as sentences the UI can show. The server still starts so the page can explain. */
export const configProblems = (): string[] => {
  const problems: string[] = [];
  if (!config.stt.apiKey) problems.push("DEEPGRAM_API_KEY is missing from .env, so audio can't be transcribed.");
  if (!config.llm.apiKey) problems.push(`${keyVar} is missing from .env, so answers can't be generated.`);
  return problems;
};
