"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig } from "@/components/ConfigContext";
import { toAppError } from "@/lib/errors";
import { playSlice, stopPlayback } from "@/lib/speech/playback";
import { speakReference } from "@/lib/speech/tts";

export type Playing = "model" | "mine" | null;

export interface MineClip {
  blob: Blob;
  offsetMs: number;
  durationMs: number;
}

/**
 * Listen, then compare. Plays the model, my own recording of the same part,
 * or both back to back (A then B) so the difference is audible.
 */
export function useCompare() {
  const { azure } = useConfig();
  const [playing, setPlaying] = useState<Playing>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => () => stopPlayback(), []);

  const run = useCallback(async (steps: (() => Promise<void>)[]) => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    try {
      for (const step of steps) await step();
    } catch (e) {
      setNote(toAppError(e, "Playback failed.").message);
    } finally {
      busy.current = false;
      setPlaying(null);
    }
  }, []);

  const model = useCallback(
    (text: string) => async () => {
      setPlaying("model");
      const voice = await speakReference(text, azure);
      if (azure && voice === "browser") setNote("Azure voice unavailable. Played with your browser's voice.");
    },
    [azure],
  );
  const mine = useCallback(
    (clip: MineClip) => async () => {
      setPlaying("mine");
      await playSlice(clip.blob, clip.offsetMs, clip.durationMs);
    },
    [],
  );

  return {
    playing,
    note,
    playModel: useCallback((text: string) => run([model(text)]), [run, model]),
    playMine: useCallback((clip: MineClip) => run([mine(clip)]), [run, mine]),
    /** A then B: the model, a short breath, then me. */
    compare: useCallback(
      (text: string, clip: MineClip) => run([model(text), () => new Promise((r) => setTimeout(r, 260)), mine(clip)]),
      [run, model, mine],
    ),
  };
}
