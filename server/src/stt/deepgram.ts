import WebSocket from "ws";
import { SAMPLE_RATE } from "@cueline/shared";
import type { Logger } from "../lib/log.ts";
import { SttError, type SttHandlers, type SttStream } from "./types.ts";

// Deepgram live transcription over its raw WebSocket API (no SDK: the protocol is small and this
// keeps every byte on the wire visible). Docs: https://developers.deepgram.com/reference/listen-live

export interface DeepgramOptions {
  apiKey: string;
  model: string;
  language: string;
  endpointingMs: number;
  utteranceEndMs: number;
}

/** Audio queued while the socket opens or reconnects. Beyond this we drop the oldest audio. */
const MAX_QUEUED_BYTES = SAMPLE_RATE * 2 * 5;
/** Deepgram closes idle streams after ~10 s without audio; we never go that quiet. */
const KEEPALIVE_MS = 4000;
const MAX_RECONNECTS = 3;

interface DeepgramWord {
  start: number;
  end: number;
}

interface DeepgramMessage {
  type: "Results" | "UtteranceEnd" | "SpeechStarted" | "Metadata" | "Error";
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  last_word_end?: number;
  channel?: { alternatives?: { transcript?: string; words?: DeepgramWord[] }[] };
  description?: string;
}

const buildUrl = (o: DeepgramOptions) => {
  const params = new URLSearchParams({
    model: o.model,
    language: o.language,
    encoding: "linear16",
    sample_rate: String(SAMPLE_RATE),
    channels: "1",
    interim_results: "true", // live preview while someone is still talking
    smart_format: "true", // punctuation (a trailing "?" is a strong question signal) and numerals
    endpointing: String(o.endpointingMs), // silence before speech_final=true
    utterance_end_ms: String(o.utteranceEndMs), // word-gap based backup, robust to noise
    vad_events: "true", // SpeechStarted lets us cancel a pending "are they done?" wait
  });
  return `wss://api.deepgram.com/v1/listen?${params}`;
};

export const createDeepgramStream = (options: DeepgramOptions, handlers: SttHandlers, log: Logger): SttStream => {
  let socket: WebSocket | null = null;
  let queue: Buffer[] = [];
  let queuedBytes = 0;
  let finishing = false;
  let reconnects = 0;
  let lastSendAt = Date.now();
  let segmentCounter = 0;
  /** Audio seconds sent on earlier connections: Deepgram restarts its clock at 0 on reconnect. */
  let clockOffset = 0;
  let sentSeconds = 0;

  const flushQueue = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    for (const chunk of queue) socket.send(chunk);
    queue = [];
    queuedBytes = 0;
    lastSendAt = Date.now();
  };

  const keepAlive = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN && Date.now() - lastSendAt > KEEPALIVE_MS) {
      socket.send(JSON.stringify({ type: "KeepAlive" }));
      lastSendAt = Date.now();
    }
  }, 1000);

  const stop = () => {
    finishing = true;
    clearInterval(keepAlive);
  };

  const handleMessage = (raw: WebSocket.RawData) => {
    let msg: DeepgramMessage;
    try {
      msg = JSON.parse(raw.toString()) as DeepgramMessage;
    } catch {
      return;
    }
    if (msg.type === "Results") {
      const alt = msg.channel?.alternatives?.[0];
      const text = alt?.transcript?.trim() ?? "";
      const start = clockOffset + (msg.start ?? 0);
      const words = alt?.words ?? [];
      // Use the last word's end, not the window end: trailing silence isn't speech
      const lastWord = words[words.length - 1];
      const end = lastWord ? clockOffset + lastWord.end : start + (msg.duration ?? 0);
      if (text || msg.speech_final) {
        handlers.onTranscript({
          segmentId: `s${segmentCounter}`,
          text,
          isFinal: Boolean(msg.is_final),
          speechFinal: Boolean(msg.speech_final),
          start,
          end,
        });
      }
      if (msg.is_final) segmentCounter += 1;
    } else if (msg.type === "UtteranceEnd") {
      handlers.onUtteranceEnd(clockOffset + (msg.last_word_end ?? 0));
    } else if (msg.type === "SpeechStarted") {
      handlers.onSpeechStarted();
    } else if (msg.type === "Error") {
      handlers.onError(new SttError(`Deepgram: ${msg.description ?? "unknown error"}`, { fatal: false }));
    }
  };

  const connect = () => {
    const ws = new WebSocket(buildUrl(options), { headers: { Authorization: `Token ${options.apiKey}` } });
    socket = ws;

    ws.on("open", () => {
      log.info("deepgram connected", { model: options.model, reconnects });
      flushQueue();
      handlers.onOpen();
    });
    ws.on("message", handleMessage);
    // A rejected handshake (bad key, no credit) arrives as an HTTP response, not a socket error
    ws.on("unexpected-response", (_req, res) => {
      const status = res.statusCode ?? 0;
      const message =
        status === 401 || status === 403
          ? "Deepgram rejected the API key. Check DEEPGRAM_API_KEY in .env."
          : status === 402
            ? "The Deepgram account is out of credit."
            : `Deepgram refused the connection (HTTP ${status}).`;
      stop();
      handlers.onError(new SttError(message, { fatal: true }));
      ws.terminate();
    });
    ws.on("error", (err) => log.warn("deepgram socket error", { error: err.message }));
    ws.on("close", (code, reason) => {
      if (socket !== ws) return;
      socket = null;
      if (finishing) return;
      // Unexpected drop (network blip, server restart): reconnect and keep the session alive
      if (reconnects >= MAX_RECONNECTS) {
        stop();
        handlers.onError(new SttError("Lost the connection to Deepgram.", { fatal: true }));
        return;
      }
      reconnects += 1;
      clockOffset = sentSeconds;
      const delay = 250 * 2 ** (reconnects - 1);
      log.warn("deepgram closed unexpectedly, reconnecting", { code, reason: reason.toString(), delay });
      setTimeout(() => {
        if (!finishing) connect();
      }, delay);
    });
  };

  connect();

  return {
    send(pcm) {
      if (finishing) return;
      sentSeconds += pcm.length / 2 / SAMPLE_RATE;
      if (socket?.readyState === WebSocket.OPEN && queue.length === 0) {
        socket.send(pcm);
        lastSendAt = Date.now();
        return;
      }
      queue.push(pcm);
      queuedBytes += pcm.length;
      while (queuedBytes > MAX_QUEUED_BYTES && queue.length > 1) queuedBytes -= queue.shift()!.length;
      flushQueue();
    },
    finish() {
      if (finishing) return;
      stop();
      const ws = socket;
      if (ws?.readyState === WebSocket.OPEN) {
        // CloseStream makes Deepgram flush the last results, then it closes the socket itself
        ws.send(JSON.stringify({ type: "CloseStream" }));
        setTimeout(() => ws.terminate(), 2000).unref();
      } else {
        ws?.terminate();
      }
    },
  };
};
