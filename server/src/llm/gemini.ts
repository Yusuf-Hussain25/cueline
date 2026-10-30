import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { LlmError, type ChatMessage, type LlmClient } from "./types.ts";

// Gemini as the alternative provider (generous free tier). Thinking is switched off: it can add
// seconds before the first token, and a 70-word spoken answer doesn't need it.

const describe = (err: unknown): LlmError => {
  if (err instanceof ApiError) {
    if (err.status === 400 && /api key/i.test(err.message)) return new LlmError("Gemini rejected the API key. Check GEMINI_API_KEY in .env.", 401);
    if (err.status === 401 || err.status === 403) return new LlmError("Gemini rejected the API key. Check GEMINI_API_KEY in .env.", err.status);
    if (err.status === 429) return new LlmError("Gemini rate limit reached. Wait a moment and try again.", 429);
    if (err.status === 404) return new LlmError("Gemini doesn't know that model. Check GEMINI_MODEL in .env.", 404);
    return new LlmError(`Gemini: ${err.message}`, err.status);
  }
  return new LlmError(err instanceof Error ? err.message : String(err));
};

/** Gemini takes the system prompt separately and calls the assistant role "model". */
const toGemini = (messages: ChatMessage[]) => {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents: Content[] = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  return { system, contents };
};

export const createGeminiClient = ({ apiKey, model, classifierModel }: { apiKey: string; model: string; classifierModel: string }): LlmClient => {
  const ai = new GoogleGenAI({ apiKey });

  return {
    provider: "gemini",
    model,
    classifierModel,

    async *stream(messages, { signal, maxTokens, temperature }) {
      const { system, contents } = toGemini(messages);
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: system,
            maxOutputTokens: maxTokens,
            temperature,
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: signal,
          },
        });
        for await (const chunk of stream) {
          const delta = chunk.text;
          if (delta) yield delta;
        }
      } catch (err) {
        if (signal.aborted) return;
        throw describe(err);
      }
    },

    async completeJson(messages, { signal, maxTokens }) {
      const { system, contents } = toGemini(messages);
      try {
        const res = await ai.models.generateContent({
          model: classifierModel,
          contents,
          config: {
            systemInstruction: system,
            maxOutputTokens: maxTokens,
            temperature: 0,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: signal,
          },
        });
        return res.text ?? "";
      } catch (err) {
        throw describe(err);
      }
    },
  };
};
