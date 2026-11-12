"use client";

import { useMemo, useState } from "react";
import { useConfig } from "@/components/ConfigContext";
import { analyticsSessions } from "@/lib/history";
import { masteryLevel, type MasteryLevel } from "@/lib/learning/mastery";
import { buildObservations } from "@/lib/learning/observations";
import { rankByRecurrence, type SoundPriority } from "@/lib/learning/priority";
import { dueQueue, reviewState, type ReviewState } from "@/lib/learning/schedule";
import { useLearning } from "@/lib/learning/store";
import { activeEvent } from "@/lib/modes/event";
import { useModes } from "@/lib/modes/store";
import { applyOverrides } from "@/lib/modes/trust";
import { dueWords } from "@/lib/modes/words";
import type { Observation } from "@/lib/learning/types";
import { useStore } from "@/lib/store";
import type { SessionRecord } from "@/lib/types";

export interface SoundEntry {
  phoneme: string;
  observations: Observation[];
  level: MasteryLevel;
  review: ReviewState | null;
  latest: number;
  occurrences: number;
}

/**
 * Everything the learning screens need, derived from the two stores.
 * Demo data only counts while there is no real history, same rule as the trend chart.
 */
export function useAtlas() {
  const store = useStore();
  const learn = useLearning();
  const extra = useModes();
  const config = useConfig();
  const [now] = useState(() => new Date());

  return useMemo(() => {
    const sessions: SessionRecord[] = analyticsSessions(store.sessions).sort((a, b) => a.date.localeCompare(b.date));
    const usingDemo = sessions.length > 0 && sessions.every((s) => s.source === "demo");
    const keep = <T extends { source: string }>(items: readonly T[]): T[] => items.filter((i) => (usingDemo ? true : i.source !== "demo"));
    const drillTakes = keep(learn.drillTakes);
    const earAttempts = keep(learn.earAttempts);
    const drillScriptIds = new Set(store.scripts.filter((s) => s.tags.includes("drill")).map((s) => s.id));

    // Two additions to the evidence, neither stored in the session history itself:
    // words I marked "this was fine" are taken out of their take, and baseline scans count as real speech.
    const scans = keep(extra.scans).sort((a, b) => a.date.localeCompare(b.date));
    const evidence: SessionRecord[] = [
      ...sessions.map((s) => {
        const mine = extra.overrides.filter((o) => o.resultId === s.id);
        return mine.length ? { ...s, phonemeStats: applyOverrides(s.phonemeStats, mine) } : s;
      }),
      ...scans.map((scan) => ({ id: scan.id, date: scan.date, scriptId: "baseline-scan", scriptTitle: "Baseline scan", source: scan.source, scores: null, wordsPerMinute: null, longPauseCount: null, phonemeStats: scan.stats })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const savedWords = keep(extra.words);
    const observations = buildObservations(evidence, drillTakes, drillScriptIds);
    const sounds = new Map<string, SoundEntry>();
    for (const [phoneme, list] of observations) {
      sounds.set(phoneme, {
        phoneme,
        observations: list,
        level: masteryLevel(list),
        review: reviewState(list, now),
        latest: list[list.length - 1]?.average ?? 0,
        occurrences: list.reduce((n, o) => n + o.count, 0),
      });
    }

    return {
      hydrated: store.hydrated && learn.hydrated && extra.hydrated,
      scans,
      savedWords,
      dueWords: dueWords(savedWords, now),
      event: activeEvent(extra.events, now),
      now,
      sessions,
      /** Sample data is showing and there is no Azure key: takes are simulated. */
      demoMode: usingDemo && !config.azure,
      usingDemo,
      observations,
      sounds,
      due: dueQueue(observations, now),
      priorities: rankByRecurrence(evidence.filter((s) => !drillScriptIds.has(s.scriptId))) as SoundPriority[],
      drillTakes,
      earAttempts,
      activityDates: [...sessions.map((s) => s.date), ...drillTakes.map((t) => t.date), ...earAttempts.map((a) => a.date), ...scans.map((s) => s.date), ...keep(extra.talks).map((t) => t.date), ...keep(extra.shadows).map((s) => s.date)],
    };
  }, [store.sessions, store.scripts, store.hydrated, learn.drillTakes, learn.earAttempts, learn.hydrated, extra.scans, extra.overrides, extra.words, extra.events, extra.talks, extra.shadows, extra.hydrated, config.azure, now]);
}
