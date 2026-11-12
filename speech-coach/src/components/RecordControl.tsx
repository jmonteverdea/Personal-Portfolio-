"use client";

import type { RecorderPhase } from "@/hooks/useTakeRecorder";
import { Kbd, Spinner } from "./ds/ui";

/** The one big control of every speaking surface. Space starts and stops it. */
export function RecordControl({
  phase,
  onStart,
  onStop,
  disabled = false,
  idleLabel = "Record",
  size = "lg",
}: {
  phase: RecorderPhase;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  idleLabel?: string;
  size?: "md" | "lg";
}) {
  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "processing";
  const dims = size === "lg" ? "h-16 pl-5 pr-6 text-base" : "h-12 pl-4 pr-5 text-sm";
  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled || busy}
      aria-pressed={recording}
      className={`press group inline-flex items-center gap-4 rounded-full border font-medium disabled:cursor-not-allowed disabled:opacity-40 ${dims} ${
        recording ? "border-signal bg-signal text-bg" : "border-fg bg-fg text-bg hover:border-signal hover:bg-signal"
      }`}
    >
      <span className={`flex items-center justify-center rounded-full ${size === "lg" ? "h-9 w-9" : "h-7 w-7"} ${recording ? "bg-bg/15" : "bg-bg/10"}`} aria-hidden>
        {busy ? <Spinner /> : recording ? <span className="h-3 w-3 bg-bg" /> : <span className="h-3.5 w-3.5 rounded-full bg-signal group-hover:bg-bg" />}
      </span>
      {phase === "starting" ? "Opening microphone" : phase === "processing" ? "Scoring" : recording ? "Stop" : idleLabel}
      {!busy && <Kbd inverted>space</Kbd>}
    </button>
  );
}

export function RecordingStatus({ phase, elapsed }: { phase: RecorderPhase; elapsed: string }) {
  const recording = phase === "recording";
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <span className={`h-2.5 w-2.5 rounded-full ${recording ? "rec-dot bg-signal" : "bg-rule-strong"}`} aria-hidden />
      <span className={`label ${recording ? "!text-signal" : "text-fg-3"}`}>{recording ? "Recording" : phase === "processing" ? "Scoring" : phase === "starting" ? "Starting" : "Standing by"}</span>
      <span className="font-mono text-lg tabular-nums text-fg" aria-label="Elapsed time">{elapsed}</span>
    </div>
  );
}
