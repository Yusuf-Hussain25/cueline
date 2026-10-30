// Plays a WAV file into a running Cueline server exactly like the browser does (50 ms PCM chunks
// in real time over the WebSocket) and prints every decision and latency. A repeatable end-to-end
// test of the whole pipeline without a microphone.
//
//   npm run simulate                          → plays scripts/audio/interview.wav
//   npm run simulate -- path/to/16k-mono.wav
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";
import { CHUNK_BYTES, CHUNK_MS, SAMPLE_RATE, type AnswerMetrics, type ServerMessage } from "@cueline/shared";
import { config } from "../src/config.ts";

const file = resolve(process.argv[2] ?? resolve(import.meta.dirname, "audio/interview.wav"));

/** Returns the PCM payload of a 16 kHz mono 16-bit WAV. */
const readWav = (path: string): Buffer => {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let offset = 12;
  let format: { channels: number; rate: number; bits: number } | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") format = { channels: buf.readUInt16LE(offset + 10), rate: buf.readUInt32LE(offset + 12), bits: buf.readUInt16LE(offset + 22) };
    if (id === "data") {
      if (!format || format.channels !== 1 || format.rate !== SAMPLE_RATE || format.bits !== 16) {
        throw new Error(`Need 16 kHz mono 16-bit PCM. Convert with: ffmpeg -i in.wav -ar 16000 -ac 1 -c:a pcm_s16le out.wav`);
      }
      return buf.subarray(offset + 8, offset + 8 + size);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
};

const CONTEXT = {
  resume:
    "Alex Morgan, Software Engineer (3 years). Lumen Health (2023 to now): real-time appointment dashboard in React and Node.js with WebSockets for 40 clinics; moved REST polling to WebSocket push, reducing server load by 30%; on-call for production incidents. Brightcart (2022 to 2023): Next.js and TypeScript checkout, Stripe payments, raised test coverage from 40% to 75%. Skills: TypeScript, React, Next.js, Node.js, PostgreSQL, Redis, WebSockets, Docker, AWS.",
  jobDescription:
    "Software Engineer, Real-Time AI Products: build low-latency streaming pipelines (audio, speech-to-text, LLM) in Node.js/TypeScript and responsive React/Next.js interfaces. 2+ years experience, WebSockets or real-time systems, LLM APIs a plus.",
};

const pcm = readWav(file);
const seconds = pcm.length / 2 / SAMPLE_RATE;
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
const fmt = (ms: number | null) => (ms === null ? "—" : `${Math.round(ms)} ms`);

const results: { question: string; metrics: AnswerMetrics; answer: string }[] = [];
const answers = new Map<string, string>();

const ws = new WebSocket(`ws://localhost:${config.port}/ws`, { origin: config.allowedOrigins[0] });

ws.on("open", () => {
  console.log(`playing ${file} (${seconds.toFixed(1)} s) into ws://localhost:${config.port}/ws\n`);
  ws.send(JSON.stringify({ type: "start", context: CONTEXT }));
  let offset = 0;
  const timer = setInterval(() => {
    if (offset >= pcm.length) {
      clearInterval(timer);
      setTimeout(() => ws.send(JSON.stringify({ type: "stop" })), 500);
      setTimeout(() => ws.close(), 1500);
      return;
    }
    ws.send(pcm.subarray(offset, offset + CHUNK_BYTES));
    offset += CHUNK_BYTES;
  }, CHUNK_MS);
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString()) as ServerMessage;
  switch (msg.type) {
    case "transcript":
      if (msg.isFinal) console.log(`${stamp()}  heard     ${msg.text}`);
      break;
    case "ignored":
      console.log(`${stamp()}  skipped   (${msg.reason})`);
      break;
    case "pending":
      console.log(`${stamp()}  waiting   sounds unfinished`);
      break;
    case "question":
      console.log(`${stamp()}  QUESTION  [${msg.path}] ${msg.text}`);
      answers.set(msg.id, "");
      break;
    case "answer_delta":
      answers.set(msg.id, (answers.get(msg.id) ?? "") + msg.delta);
      break;
    case "answer_done": {
      const m = msg.metrics;
      console.log(`${stamp()}  ANSWER    e2e ${fmt(m.endToEndMs)} · detect ${fmt(m.detectMs)} · ttft ${fmt(m.ttftMs)} · ${m.words} words${msg.cancelled ? " · CANCELLED" : ""}`);
      console.log(msg.text.trim().replace(/^/gm, "                   "));
      results.push({ question: "", metrics: m, answer: msg.text });
      break;
    }
    case "error":
      console.log(`${stamp()}  ERROR     ${msg.message}`);
      break;
    case "state":
    case "ready":
    case "memory_cleared":
      break;
  }
});

ws.on("close", () => {
  const e2e = results.map((r) => r.metrics.endToEndMs).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = e2e.length ? e2e[Math.floor(e2e.length / 2)]! : null;
  console.log(`\n${results.length} answers · median end-to-end ${fmt(median)} · worst ${fmt(e2e.at(-1) ?? null)} · ${e2e.filter((v) => v <= 3000).length}/${e2e.length} under 3 s`);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error(`Couldn't connect to the server: ${err.message}. Is \`npm run dev\` running?`);
  process.exit(1);
});
