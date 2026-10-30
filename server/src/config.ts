import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// One .env at the repo root configures everything. Real environment variables win over the file.
const envFile = resolve(import.meta.dirname, "../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

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

  LLM_PROVIDER: z.enum(["groq", "gemini"]).optional(),
  GROQ_API_KEY: optional,
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GROQ_CLASSIFIER_MODEL: z.string().default("llama-3.1-8b-instant"),
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_CLASSIFIER_MODEL: z.string().default("gemini-2.5-flash-lite"),

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

const llmProvider = env.LLM_PROVIDER ?? (env.GROQ_API_KEY || !env.GEMINI_API_KEY ? "groq" : "gemini");

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
  llm:
    llmProvider === "groq"
      ? { provider: "groq", apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL, classifierModel: env.GROQ_CLASSIFIER_MODEL }
      : { provider: "gemini", apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, classifierModel: env.GEMINI_CLASSIFIER_MODEL },
  memoryTurns: env.MEMORY_TURNS,
} as const;

export type LlmConfig = typeof config.llm;

/** Missing keys as sentences the UI can show. The server still starts so the page can explain. */
export const configProblems = (): string[] => {
  const problems: string[] = [];
  if (!config.stt.apiKey) problems.push("DEEPGRAM_API_KEY is missing from .env, so audio can't be transcribed.");
  if (!config.llm.apiKey) {
    const key = config.llm.provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY";
    problems.push(`${key} is missing from .env, so answers can't be generated.`);
  }
  return problems;
};
