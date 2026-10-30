// Generates a mock interview recording with Deepgram text-to-speech, for `npm run simulate` and for
// demoing without a real interviewer. It deliberately includes small talk, an acknowledgement, a
// question with a mid-sentence pause, and a follow-up that only makes sense with memory.
//
//   node scripts/make-test-audio.ts            → scripts/audio/interview.wav
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SAMPLE_RATE } from "@cueline/shared";
import { config } from "../src/config.ts";

type Part = { say: string } | { silenceMs: number };

const VOICE = "aura-2-orion-en";
const TURN_GAP = { silenceMs: 2600 };

const SCRIPT: Part[] = [
  { say: "Hi, thanks for joining today. Can you hear me okay?" },
  TURN_GAP,
  { say: "Great. So, to start, tell me about yourself." },
  { silenceMs: 9000 },
  { say: "Okay, thanks." },
  TURN_GAP,
  { say: "What's the difference between WebSockets and server-sent events, and when would you pick each one?" },
  { silenceMs: 9000 },
  { say: "Tell me about a time when" },
  { silenceMs: 900 },
  { say: "you had to fix a production issue under pressure." },
  { silenceMs: 9000 },
  { say: "Interesting. Can you go a bit deeper on how you found the root cause?" },
  { silenceMs: 9000 },
  { say: "Why do you want to join our team?" },
  { silenceMs: 6000 },
];

const speak = async (text: string, apiKey: string): Promise<Buffer> => {
  const params = new URLSearchParams({ model: VOICE, encoding: "linear16", sample_rate: String(SAMPLE_RATE), container: "none" });
  const res = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Deepgram TTS failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
};

const wavHeader = (dataBytes: number) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
};

const apiKey = config.stt.apiKey;
if (!apiKey) {
  console.error("DEEPGRAM_API_KEY is missing from .env");
  process.exit(1);
}

const chunks: Buffer[] = [];
for (const part of SCRIPT) {
  if ("say" in part) {
    process.stdout.write(`speaking: ${part.say}\n`);
    chunks.push(await speak(part.say, apiKey));
  } else {
    chunks.push(Buffer.alloc(Math.round((part.silenceMs / 1000) * SAMPLE_RATE) * 2));
  }
}
const pcm = Buffer.concat(chunks);
const outDir = resolve(import.meta.dirname, "audio");
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, "interview.wav");
writeFileSync(out, Buffer.concat([wavHeader(pcm.length), pcm]));
console.log(`wrote ${out} (${(pcm.length / 2 / SAMPLE_RATE).toFixed(1)} s)`);
