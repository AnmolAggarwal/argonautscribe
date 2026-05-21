/**
 * useRecorder — React hook around the browser MediaRecorder API.
 *
 * Exposes start() / stop() driven by explicit user actions (button
 * clicks). DO NOT call start() from a useEffect — React StrictMode runs
 * effects twice in dev and would request the mic twice + start two
 * recordings simultaneously, producing duplicate segments. SPEC §20.4 #4.
 *
 * Audio settings come from SPEC §6.1 and §10.1: 16 kHz mono with the
 * browser's built-in echoCancellation / noiseSuppression / AGC enabled.
 * Browsers may negotiate down (Safari rounds to 48k internally) but
 * Deepgram accepts both WebM/Opus (Chrome/Edge) and MP4/AAC (Safari)
 * without issue.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "error";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

interface UseRecorderReturn {
  state: RecorderState;
  /** Seconds of audio captured so far during the current recording. */
  duration: number;
  /** Last error message, cleared on next start(). */
  error: string | null;
  start: () => Promise<void>;
  /**
   * Returns the recorded blob, mime type, and duration. Resolves null
   * if there was no active recording or the user denied permission.
   */
  stop: () => Promise<RecordingResult | null>;
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const tickIntervalRef = useRef<number | null>(null);
  const stopResolverRef = useRef<((r: RecordingResult | null) => void) | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickIntervalRef.current !== null) {
      window.clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  // Safety: stop the mic if the component using the hook unmounts mid-recording.
  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "error") return;
    setState("requesting");
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const durationMs = Date.now() - startTimeRef.current;
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        cleanupStream();
        setState("idle");
        setDuration(0);
        resolver?.({ blob, mimeType: recorder.mimeType || "audio/webm", durationMs });
      };

      recorder.onerror = (event) => {
        const message =
          (event as unknown as { error?: { message?: string } }).error?.message ??
          "MediaRecorder error";
        setError(message);
        cleanupStream();
        setState("error");
        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        resolver?.(null);
      };

      recorder.start();
      startTimeRef.current = Date.now();
      setDuration(0);
      tickIntervalRef.current = window.setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      setState("recording");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      cleanupStream();
      setState("error");
    }
  }, [state, cleanupStream]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state !== "recording") {
      return Promise.resolve(null);
    }
    setState("stopping");
    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
  }, [state]);

  return { state, duration, error, start, stop };
}

/** Format milliseconds as M:SS for display. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
