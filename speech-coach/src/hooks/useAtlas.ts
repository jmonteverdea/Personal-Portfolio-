"use client";

import { useMemo, useState } from "react";
import { useConfig } from "@/components/ConfigContext";
import { analyticsSessions } from "@/lib/history";
import { masteryLevel, type MasteryLevel } from "@/lib/learning/mastery";
import { buildObservations } from "@/lib/learning/observations";
import { rankByRecurrence, type SoundPriority } from "@/lib/learning/priority";
import { dueQueue, reviewState, type ReviewState } from "@/lib/learning/schedule";
import { useLearning } from "@/lib/learning/store";
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
  const config = useConfig();
  const [now] = useState(() => new Date());

  return useMemo(() => {
    const sessions: SessionRecord[] = analyticsSessions(store.sessions).sort((a, b) => a.date.localeCompare(b.date));
    const usingDemo = sessions.length > 0 && sessions.every((s) => s.source === "demo");
    const keep = <T extends { source: string }>(items: readonly T[]): T[] => items.filter((i) => (usingDemo ? true : i.source !== "demo"));
    const drillTakes = keep(learn.drillTakes);
    const earAttempts = keep(learn.earAttempts);
    const drillScriptIds = new Set(store.scripts.filter((s) => s.tags.includes("drill")).map((s) => s.id));

    const observations = buildObservations(sessions, drillTakes, drillScriptIds);
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
      hydrated: store.hydrated && learn.hydrated,
      now,
      sessions,
      /** Sample data is showing and there is no Azure key: takes are simulated. */
      demoMode: usingDemo && !config.azure,
      usingDemo,
      observations,
      sounds,
      due: dueQueue(observations, now),
      priorities: rankByRecurrence(sessions.filter((s) => !drillScriptIds.has(s.scriptId))) as SoundPriority[],
      drillTakes,
      earAttempts,
      activityDates: [...sessions.map((s) => s.date), ...drillTakes.map((t) => t.date), ...earAttempts.map((a) => a.date)],
    };
  }, [store.sessions, store.scripts, store.hydrated, learn.drillTakes, learn.earAttempts, learn.hydrated, config.azure, now]);
}
