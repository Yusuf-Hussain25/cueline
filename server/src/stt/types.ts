// Provider-neutral speech-to-text contract. The session only talks to this interface, so swapping
// Deepgram for AssemblyAI or a self-hosted Whisper means writing one new file.

export interface TranscriptEvent {
  /** Groups interim updates of the same stretch of audio; a final result closes the segment. */
  segmentId: string;
  text: string;
  /** Final text for this segment; it won't change any more. */
  isFinal: boolean;
  /** The provider believes the speaker stopped talking after this segment (endpointing). */
  speechFinal: boolean;
  /** Audio time in seconds since the stream started. */
  start: number;
  end: number;
}

export interface SttHandlers {
  /** The provider accepted the stream; audio is flowing. */
  onOpen: () => void;
  onTranscript: (event: TranscriptEvent) => void;
  /** Backup end-of-turn signal: no new words for a while (seconds of audio time). */
  onUtteranceEnd: (lastWordEnd: number) => void;
  /** Voice activity started; useful to cancel a "maybe they're done" wait. */
  onSpeechStarted: () => void;
  onError: (error: SttError) => void;
}

export interface SttStream {
  /** Queues 16 kHz 16-bit mono PCM. Safe to call before the connection is open. */
  send: (pcm: Buffer) => void;
  /** Flushes buffered audio and closes the stream gracefully. */
  finish: () => void;
}

export class SttError extends Error {
  readonly fatal: boolean;

  constructor(message: string, { fatal }: { fatal: boolean }) {
    super(message);
    this.name = "SttError";
    this.fatal = fatal;
  }
}
