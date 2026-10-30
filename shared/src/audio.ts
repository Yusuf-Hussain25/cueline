/** Every audio frame on the wire is 16-bit little-endian PCM, mono, at this rate. */
export const SAMPLE_RATE = 16000;

/** The browser batches audio into chunks this long before sending (Deepgram suggests 20–100 ms). */
export const CHUNK_MS = 50;

export const BYTES_PER_SAMPLE = 2;

/** Bytes in one chunk: 16000 * 0.05 * 2 = 1600. */
export const CHUNK_BYTES = (SAMPLE_RATE * CHUNK_MS * BYTES_PER_SAMPLE) / 1000;

/** Limits the server enforces so one client can't exhaust memory or the STT quota. */
export const LIMITS = {
  /** Longest resume or job description accepted, in characters. */
  contextChars: 12000,
  /** Longest typed question. */
  questionChars: 600,
  /** Largest single audio frame (one second of audio). */
  audioFrameBytes: SAMPLE_RATE * BYTES_PER_SAMPLE,
} as const;
