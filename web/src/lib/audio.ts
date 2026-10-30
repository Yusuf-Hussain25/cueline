import { CHUNK_MS, SAMPLE_RATE } from "@cueline/shared";

export type AudioSource = "tab" | "mic";

/** A user-facing error from audio capture (permission denied, no tab audio, …). */
export class CaptureError extends Error {}

/**
 * Asks the browser for audio.
 *  - "tab": the meeting tab (Google Meet, Zoom web, a YouTube mock interview) via screen share.
 *    Only the interviewer is in it: the meeting doesn't play your own voice back to you.
 *  - "mic": the microphone, as a fallback (it also hears you, and the interviewer via speakers).
 */
export const getAudioStream = async (source: AudioSource): Promise<MediaStream> => {
  if (!navigator.mediaDevices) throw new CaptureError("Audio capture needs a secure page (https or localhost).");

  if (source === "mic") {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      throw new CaptureError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it from the address bar and try again."
          : "Couldn't open the microphone.",
      );
    }
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // Chrome only offers tab audio together with video; the video track is dropped right away
      video: true,
      // Raw audio: echo cancellation would try to remove the interviewer as "far end" noise
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      // @ts-expect-error Chrome-only hints, not yet in the DOM typings
      systemAudio: "include",
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
    });
  } catch (err) {
    throw new CaptureError(
      err instanceof DOMException && err.name === "NotAllowedError"
        ? "Screen share was cancelled. Pick the meeting tab and keep “Share tab audio” on."
        : "This browser can't share tab audio. Use Chrome or Edge, or switch to Microphone.",
    );
  }
  stream.getVideoTracks().forEach((t) => t.stop());
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CaptureError("No audio was shared. Choose a Chrome tab and switch on “Share tab audio”.");
  }
  return stream;
};

const FRAME = (SAMPLE_RATE * CHUNK_MS) / 1000; // 800 samples = 50 ms

// Runs on the audio thread. It averages the input down to 16 kHz (no AudioContext({ sampleRate })
// so Firefox works too), converts to 16-bit PCM and posts one 50 ms chunk at a time.
// Adapted from the live-transcription worklet in my Meetora video-calling app.
const WORKLET = `
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${SAMPLE_RATE};
    this.pos = 0; this.sum = 0; this.count = 0;
    this.out = new Int16Array(${FRAME}); this.len = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channels = input.length;
    const length = input[0].length;
    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (let c = 0; c < channels; c++) sample += input[c][i];
      this.sum += sample / channels; this.count++; this.pos++;
      if (this.pos < this.ratio) continue;
      this.pos -= this.ratio;
      const v = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0; this.count = 0;
      this.out[this.len++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.len === this.out.length) {
        this.port.postMessage(this.out, [this.out.buffer]);
        this.out = new Int16Array(${FRAME}); this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor("cueline-pcm16k", Pcm16k);
`;

let workletUrl: string | null = null;

export interface PcmPipeline {
  stop: () => void;
}

/**
 * Streams a MediaStream as 16 kHz PCM chunks. `onLevel` gets 0..1 loudness per chunk for the meter.
 * `onEnded` fires if the user stops sharing from the browser's own "Stop sharing" bar.
 */
export const startPcmPipeline = async (
  stream: MediaStream,
  { onChunk, onLevel, onEnded }: { onChunk: (pcm: ArrayBuffer) => void; onLevel: (level: number) => void; onEnded: () => void },
): Promise<PcmPipeline> => {
  const ctx = new AudioContext();
  workletUrl ??= URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(workletUrl);

  const source = ctx.createMediaStreamSource(stream);
  // No outputs: audio is only analysed and sent, never played back (no echo into the meeting)
  const node = new AudioWorkletNode(ctx, "cueline-pcm16k", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (e: MessageEvent<Int16Array>) => {
    const pcm = e.data;
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / pcm.length) / 0x7fff;
    onLevel(Math.min(1, rms * 6));
    onChunk(pcm.buffer as ArrayBuffer);
  };
  source.connect(node);
  if (ctx.state === "suspended") await ctx.resume();

  const track = stream.getAudioTracks()[0];
  track?.addEventListener("ended", onEnded);

  return {
    stop() {
      track?.removeEventListener("ended", onEnded);
      node.port.onmessage = null;
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
};
