"use client";

import { useMemo } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { wordsWithSound } from "@/lib/learning/content";
import { useStore } from "@/lib/store";
import { normalizeWord } from "@/lib/text";
import { buildEventPlan, type EventPlan } from "./event";
import type { SpeakingEvent } from "./types";

const WEAK_SOUNDS = 5;

/** The rehearsal plan for one event: its script scanned against my weak sounds and my saved words. */
export function useEventPlan(event: SpeakingEvent | null): { plan: EventPlan | null; scriptTitle: string | null } {
  const atlas = useAtlas();
  const store = useStore();
  return useMemo(() => {
    const script = event ? store.scripts.find((s) => s.id === event.scriptId) ?? null : null;
    if (!event || !script) return { plan: null, scriptTitle: null };
    const results = Object.values(store.results);
    const hardWords = new Set<string>(atlas.savedWords.map((w) => normalizeWord(w.word)));
    for (const p of atlas.priorities.slice(0, WEAK_SOUNDS)) for (const w of wordsWithSound(p.phoneme, results, p.examples)) hardWords.add(w);
    return { plan: buildEventPlan({ eventDay: event.day, today: atlas.now, scriptText: script.text, hardWords }), scriptTitle: script.title };
  }, [event, store.scripts, store.results, atlas.savedWords, atlas.priorities, atlas.now]);
}
