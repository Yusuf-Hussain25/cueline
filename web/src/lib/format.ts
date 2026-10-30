export const formatMs = (ms: number | null | undefined) => {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
};

/** 10:14:45, 24-hour so it fits the timestamp column. */
export const formatClock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const PROVIDER_NAMES: Record<string, string> = {
  deepgram: "Deepgram",
  groq: "Groq",
  anthropic: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
  deepseek: "DeepSeek",
};

/** "claude-haiku-5-5" → "Haiku 5.5", "nova-3" → "Nova-3", "llama-3.3-70b-versatile" → "Llama 3.3 70b". */
export const prettyModel = (provider: string, model: string) => {
  const claude = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  if (claude) return `${PROVIDER_NAMES[provider] ?? provider} ${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ""}`;
  if (/^nova-\d/.test(model)) return `${PROVIDER_NAMES[provider] ?? provider} ${model.replace(/^nova/, "Nova")}`;
  const llama = model.match(/^llama-([\d.]+)/);
  if (llama) return `${PROVIDER_NAMES[provider] ?? provider} Llama ${llama[1]}`;
  return `${PROVIDER_NAMES[provider] ?? provider} ${model}`;
};
