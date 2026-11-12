"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppError, toAppError } from "@/lib/errors";
import { startAzureSession } from "@/lib/speech/azureSession";
import type { RecordingSession, SessionOutcome } from "@/lib/speech/session";
import { startWebSpeechSession } from "@/lib/speech/webSpeechSession";
import { normalizeWords } from "@/lib/text";

export type RecorderPhase = "idle" | "starting" | "recording" | "processing";

export interface TakeFinished {
  /** Null when nothing usable was captured. */
  outcome: SessionOutcome | null;
  /** Set when the session died or nothing was heard. */
  error: AppError | null;
}

interface LiveCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
}

/**
 * One recording at a time, with either engine. Wraps the existing session
 * modules without changing them: Azure when a key is set, Web Speech otherwise.
 */
export function useTakeRecorder(azure: boolean, onFinished: (take: TakeFinished) => void) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);
  const startedAtRef = useRef(0);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  });

  const finish = useCallback(
    async (fatal: AppError | null) => {
      const session = sessionRef.current;
      if (!session || finishingRef.current) return;
      finishingRef.current = true;
      setPhase("processing");
      let outcome: SessionOutcome | null = null;
      try {
        outcome = await session.stop();
      } catch (e) {
        fatal ??= toAppError(e, "The recording could not be finalized.");
      }
      sessionRef.current = null;
      finishingRef.current = false;
      if (!mountedRef.current) return;
      setStream(null);
      setPhase("idle");

      const heard = outcome ? (azure ? outcome.segments.length > 0 : normalizeWords(outcome.transcript).length > 0) : false;
      const problem =
        fatal ?? (heard ? null : new AppError("no_speech", "Nothing was recognized. Check that the right microphone is selected, move closer to it, and try again."));
      setError(problem);
      finishedRef.current({ outcome: heard ? outcome : null, error: problem });
    },
    [azure],
  );

  const start = useCallback(
    async (referenceText: string, live: LiveCallbacks = {}): Promise<boolean> => {
      if (sessionRef.current || phase !== "idle") return false;
      setError(null);
      setPhase("starting");
      const callbacks = {
        onPartial: (text: string) => live.onPartial?.(text),
        onFinal: (text: string) => live.onFinal?.(text),
        onFatal: (fatal: AppError) => void finish(fatal),
      };
      try {
        const session = azure ? await startAzureSession(referenceText, callbacks) : await startWebSpeechSession(callbacks);
        if (!mountedRef.current) {
          session.cancel();
          return false;
        }
        sessionRef.current = session;
        startedAtRef.current = performance.now();
        setStream(session.stream);
        setPhase("recording");
        return true;
      } catch (e) {
        if (!mountedRef.current) return false;
        setError(toAppError(e, "Could not start recording."));
        setPhase("idle");
        return false;
      }
    },
    [azure, finish, phase],
  );

  const stop = useCallback(() => void finish(null), [finish]);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, []);

  return { phase, stream, error, start, stop, clearError, startedAtRef };
}
