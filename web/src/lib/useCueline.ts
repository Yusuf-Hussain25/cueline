"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CandidateContext, ClientMessage, ServerMessage } from "@cueline/shared";
import { CaptureError, getAudioStream, startPcmPipeline, type AudioSource, type PcmPipeline } from "./audio";
import { initialState, reducer } from "./sessionState";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8787";
const WS_URL = `${SERVER_URL.replace(/^http/, "ws")}/ws`;

/**
 * Owns the WebSocket and the audio pipeline. Components get state plus a few commands.
 * The socket reconnects on its own while idle, so restarting the server doesn't strand the page.
 */
export const useCueline = (levelRef: React.RefObject<number>) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const pipelineRef = useRef<PcmPipeline | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  const stopAudio = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    levelRef.current = 0;
  }, [levelRef]);

  useEffect(() => {
    let disposed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      dispatch({ type: "connection", connection: "connecting" });
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      socketRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        dispatch({ type: "connection", connection: "open" });
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        let message: ServerMessage;
        try {
          message = JSON.parse(e.data) as ServerMessage;
        } catch {
          return;
        }
        dispatch({ type: "server", message });
        // A fatal server-side error (bad STT key, lost STT) means the audio has nowhere to go
        if (message.type === "error" && message.fatal) stopAudio();
        if (message.type === "state" && message.state === "idle") stopAudio();
      };
      ws.onclose = () => {
        if (socketRef.current !== ws) return;
        socketRef.current = null;
        if (pipelineRef.current) {
          stopAudio();
          dispatch({ type: "toast", message: "Lost the connection to the Cueline server. Reconnecting…" });
        }
        dispatch({ type: "connection", connection: "closed" });
        if (disposed) return;
        const delay = Math.min(8000, 500 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
      stopAudio();
    };
  }, [stopAudio]);

  const start = useCallback(
    async (source: AudioSource, context: CandidateContext) => {
      if (pipelineRef.current) return;
      let stream: MediaStream;
      try {
        stream = await getAudioStream(source);
      } catch (err) {
        dispatch({ type: "toast", message: err instanceof CaptureError ? err.message : "Couldn't start audio capture." });
        return;
      }
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        stream.getTracks().forEach((t) => t.stop());
        dispatch({ type: "toast", message: "Not connected to the Cueline server yet. Is it running on port 8787?" });
        return;
      }
      send({ type: "start", context });
      try {
        pipelineRef.current = await startPcmPipeline(stream, {
          onChunk: (pcm) => {
            const ws = socketRef.current;
            // Drop audio rather than queue it if the network can't keep up: stale audio is useless
            if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 64 * 1024) ws.send(pcm);
          },
          onLevel: (level) => {
            levelRef.current = level;
          },
          onEnded: () => {
            stopAudio();
            send({ type: "stop" });
          },
        });
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        send({ type: "stop" });
        dispatch({ type: "toast", message: "This browser couldn't process audio. Try the latest Chrome or Edge." });
      }
    },
    [levelRef, send, stopAudio],
  );

  const stop = useCallback(() => {
    stopAudio();
    send({ type: "stop" });
  }, [send, stopAudio]);

  return {
    state,
    capturing: () => pipelineRef.current !== null,
    start,
    stop,
    updateContext: (context: CandidateContext) => send({ type: "context", context }),
    forceAnswer: () => send({ type: "force_answer" }),
    cancelAnswer: () => send({ type: "cancel_answer" }),
    ask: (text: string) => send({ type: "ask", text }),
    resetMemory: () => send({ type: "reset_memory" }),
    clearTranscript: () => dispatch({ type: "clear_transcript" }),
    dismissToast: (id: number) => dispatch({ type: "dismiss", id }),
  };
};
