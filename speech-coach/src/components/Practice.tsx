"use client";

import { ArrowLeft, FileQuestion, Mic, Square } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAssessmentResult, buildTranscriptResult } from "@/lib/azure/normalize";
import { advanceCursor } from "@/lib/diff";
import { AppError, toAppError } from "@/lib/errors";
import { startAzureSession } from "@/lib/speech/azureSession";
import type { RecordingSession, SessionCallbacks } from "@/lib/speech/session";
import { startWebSpeechSession } from "@/lib/speech/webSpeechSession";
import { actions, newId, useStore } from "@/lib/store";
import { normalizeWords, tokenizeScript } from "@/lib/text";
import type { Script } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { Teleprompter } from "./Teleprompter";
import { Button, EmptyState, formatClock, Loading, Notice, Pill } from "./ui";
import { Waveform } from "./Waveform";

type Phase = "idle" | "starting" | "recording" | "processing";

const ERROR_TITLES: Record<AppError["code"], string> = {
  mic_denied: "Microphone blocked",
  mic_missing: "No microphone",
  unsupported: "Browser not supported",
  no_speech: "No speech detected",
  network: "Network problem",
  token: "Azure Speech is not reachable",
  token_expired: "Speech token expired",
  not_configured: "Not configured",
  service: "Recording stopped",
};

function PracticeSession({ script }: { script: Script }) {
  const router = useRouter();
  const { azure } = useConfig();
  const tokens = useMemo(() => tokenizeScript(script.text), [script.text]);
  const refWords = useMemo(() => tokens.map((t) => t.norm), [tokens]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [cursor, setCursor] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [partialResultId, setPartialResultId] = useState<string | null>(null);

  const sessionRef = useRef<RecordingSession | null>(null);
  const committedRef = useRef(0);
  const startedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);

  const finish = useCallback(
    async (fatal: AppError | null) => {
      const session = sessionRef.current;
      if (!session || finishingRef.current) return;
      finishingRef.current = true;
      setPhase("processing");

      let outcome;
      try {
        outcome = await session.stop();
      } catch (e) {
        outcome = null;
        if (!fatal) fatal = toAppError(e, "The recording could not be finalized.");
      }
      sessionRef.current = null;
      finishingRef.current = false;
      if (!mountedRef.current) return;
      setStream(null);

      const heardAnything = outcome
        ? azure
          ? outcome.segments.length > 0
          : normalizeWords(outcome.transcript).length > 0
        : false;

      if (!outcome || !heardAnything) {
        setError(
          fatal ??
            new AppError("no_speech", "Nothing was recognized. Check that the right microphone is selected, move closer to it, and try again."),
        );
        setPhase("idle");
        return;
      }

      const meta = {
        id: newId("take"),
        createdAt: new Date().toISOString(),
        scriptId: script.id,
        scriptTitle: script.title,
        referenceText: script.text,
      };
      const result = azure
        ? buildAssessmentResult(outcome.segments, meta)
        : buildTranscriptResult(outcome.transcript, outcome.durationMs, meta);
      actions.saveResult(result, outcome.audio);

      if (fatal) {
        // The session died part-way. Keep what was captured, but say so instead of silently moving on.
        setError(fatal);
        setPartialResultId(result.id);
        setPhase("idle");
        return;
      }
      router.push(`/results?session=${encodeURIComponent(result.id)}`);
    },
    [azure, router, script.id, script.text, script.title],
  );

  const start = useCallback(async () => {
    setError(null);
    setPartialResultId(null);
    setCursor(0);
    setElapsedMs(0);
    committedRef.current = 0;
    setPhase("starting");

    const callbacks: SessionCallbacks = {
      onPartial: (text) => setCursor(advanceCursor(refWords, committedRef.current, normalizeWords(text))),
      onFinal: (text) => {
        committedRef.current = advanceCursor(refWords, committedRef.current, normalizeWords(text));
        setCursor(committedRef.current);
      },
      onFatal: (fatal) => void finish(fatal),
    };

    try {
      const session = azure ? await startAzureSession(script.text, callbacks) : await startWebSpeechSession(callbacks);
      if (!mountedRef.current) {
        session.cancel();
        return;
      }
      sessionRef.current = session;
      startedAtRef.current = performance.now();
      setStream(session.stream);
      setPhase("recording");
    } catch (e) {
      if (!mountedRef.current) return;
      setError(toAppError(e, "Could not start recording."));
      setPhase("idle");
    }
  }, [azure, finish, refWords, script.text]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 250);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, []);

  const recording = phase === "recording";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Scripts
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{script.title}</h1>
        {script.tags.map((t) => (
          <Pill key={t} tone="accent">{t}</Pill>
        ))}
      </div>

      {!azure && (
        <Notice tone="warn" title="Transcript-only mode">
          No Azure Speech key is set, so this take gets a transcript and a word-by-word comparison from your browser&apos;s
          speech recognition. Phoneme scoring is unavailable and no scores will be shown.
        </Notice>
      )}

      {error && (
        <Notice
          tone="error"
          title={ERROR_TITLES[error.code]}
          action={
            partialResultId ? (
              <Link href={`/results?session=${encodeURIComponent(partialResultId)}`} className="font-medium underline">
                View what was captured before it stopped
              </Link>
            ) : undefined
          }
        >
          {error.message}
        </Notice>
      )}

      <Teleprompter tokens={tokens} cursor={cursor} active={recording || phase === "processing"} />

      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-5">
          {recording ? (
            <button
              type="button"
              onClick={() => void finish(null)}
              className="inline-flex h-14 items-center gap-2.5 rounded-full bg-rose-600 px-6 text-base font-semibold text-white hover:bg-rose-700"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden />
              Stop
            </button>
          ) : (
            <Button
              variant="primary"
              loading={phase === "starting" || phase === "processing"}
              onClick={() => void start()}
              className="h-14 !rounded-full !px-6 !text-base"
            >
              {phase === "idle" && <Mic className="h-5 w-5" aria-hidden />}
              {phase === "starting" ? "Starting microphone" : phase === "processing" ? "Scoring your take" : "Record"}
            </Button>
          )}

          <div className="flex min-w-36 items-center gap-2.5" aria-live="polite">
            {recording ? (
              <>
                <span className="rec-dot h-3 w-3 rounded-full bg-rose-600" aria-hidden />
                <span className="text-sm font-semibold text-rose-700">Recording</span>
              </>
            ) : (
              <>
                <span className="h-3 w-3 rounded-full bg-stone-300" aria-hidden />
                <span className="text-sm text-muted">{phase === "processing" ? "Processing" : "Not recording"}</span>
              </>
            )}
            <span className="font-mono text-lg tabular-nums" aria-label="Elapsed time">{formatClock(elapsedMs)}</span>
          </div>

          <div className="min-w-48 flex-1">
            <Waveform stream={recording ? stream : null} />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          {recording
            ? `Read the script at your normal meeting pace. The highlight follows what ${azure ? "Azure" : "your browser"} hears. Press Stop when you finish.`
            : azure
              ? "Your audio is streamed to Azure Speech for scoring. The replay copy stays in this browser tab."
              : "Your browser's speech recognition may send audio to its vendor (Google in Chrome). The replay copy stays in this browser tab."}
        </p>
      </div>
    </div>
  );
}

export function Practice() {
  const id = useSearchParams().get("script");
  const { hydrated, scripts } = useStore();
  const script = scripts.find((s) => s.id === id);

  if (!hydrated) return <Loading label="Loading script" />;
  if (!script) {
    return (
      <EmptyState
        icon={<FileQuestion className="h-8 w-8" aria-hidden />}
        title="Script not found"
        action={
          <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            Back to scripts
          </Link>
        }
      >
        It may have been deleted. Pick another script to practice.
      </EmptyState>
    );
  }
  return <PracticeSession key={script.id} script={script} />;
}
