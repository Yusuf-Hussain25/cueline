// Measures LLM time to first token with the real answer prompt, so the provider choice rests on
// numbers rather than reputation.
//
//   node scripts/bench-llm.ts                         → the configured provider
//   node scripts/bench-llm.ts anthropic:claude-haiku-5-5 openai:gpt-4.1-mini
import { buildAnswerMessages } from "../src/answer/prompts.ts";
import { config, type LlmConfig } from "../src/config.ts";
import { createLlmClient } from "../src/llm/index.ts";

const QUESTIONS = [
  "Tell me about yourself.",
  "What's the difference between WebSockets and server-sent events?",
  "Tell me about a time you fixed a production issue under pressure.",
  "Why do you want to join our team?",
  "How would you reduce latency in a speech-to-text pipeline?",
];
const CONTEXT = {
  resume: "Alex Morgan, Software Engineer (3 years). Lumen Health: real-time React/Node.js dashboard with WebSockets for 40 clinics; cut server load 30%. Brightcart: Next.js checkout, Stripe, test coverage 40% to 75%.",
  jobDescription: "Software Engineer, Real-Time AI Products: low-latency audio, speech-to-text and LLM pipelines in Node.js/TypeScript; React/Next.js.",
};

const KEYS: Record<string, string | undefined> = {
  groq: process.env.GROQ_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : [`${config.llm.provider}:${config.llm.model}`];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

for (const target of targets) {
  const [provider, model] = target.split(":") as [LlmConfig["provider"], string];
  const llm = createLlmClient({ provider, apiKey: KEYS[provider], model, classifierModel: model });
  if (!llm) {
    console.log(`${target.padEnd(36)} skipped (no key)`);
    continue;
  }
  const ttft: number[] = [];
  const words: number[] = [];
  for (const question of QUESTIONS) {
    const started = performance.now();
    let first: number | null = null;
    let text = "";
    try {
      for await (const delta of llm.stream(buildAnswerMessages({ context: CONTEXT, memory: [], question, preamble: null }), {
        signal: AbortSignal.timeout(20000),
        maxTokens: 320,
        temperature: 0.4,
      })) {
        first ??= performance.now() - started;
        text += delta;
      }
    } catch (err) {
      console.log(`${target.padEnd(36)} error: ${err instanceof Error ? err.message : err}`);
      break;
    }
    if (first !== null) ttft.push(first);
    words.push(text.split(/\s+/).filter(Boolean).length);
  }
  if (ttft.length) {
    console.log(
      `${target.padEnd(36)} ttft median ${Math.round(median(ttft))} ms · min ${Math.round(Math.min(...ttft))} · max ${Math.round(Math.max(...ttft))} · words ${Math.min(...words)}-${Math.max(...words)}`,
    );
  }
}
