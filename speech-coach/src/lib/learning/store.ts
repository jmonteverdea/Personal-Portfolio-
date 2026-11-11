"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_LEARNING, type DrillTake, type EarAttempt, type GuidedSession, type LearningData, type RetryRecord } from "./types";
import { mergeLearning } from "./transfer";

/**
 * Persistence for the learning layer. One new localStorage key, separate from
 * the existing scripts, sessions and results keys, which are left untouched.
 */

const KEY = "speech-coach.learning.v1";
const MAX_RETRIES_STORED = 60;

interface LearningState extends LearningData {
  hydrated: boolean;
}

const SERVER: LearningState = { ...EMPTY_LEARNING, hydrated: false };
let state: LearningState = SERVER;
const listeners = new Set<() => void>();
/** Audio of retries and drill takes recorded in this tab, by record id. */
const audio = new Map<string, Blob>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  try {
    const { hydrated: _hydrated, ...data } = state;
    void _hydrated;
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked. The learning layer keeps working in memory.
  }
}

function hydrate(): void {
  if (state.hydrated || typeof window === "undefined") return;
  let stored: Partial<LearningData> = {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Partial<LearningData>;
  } catch {
    stored = {};
  }
  state = {
    version: 1,
    drillTakes: Array.isArray(stored.drillTakes) ? stored.drillTakes : [],
    retries: Array.isArray(stored.retries) ? stored.retries : [],
    earAttempts: Array.isArray(stored.earAttempts) ? stored.earAttempts : [],
    weeklyTarget: typeof stored.weeklyTarget === "number" ? stored.weeklyTarget : EMPTY_LEARNING.weeklyTarget,
    session: stored.session ?? null,
    hydrated: true,
  };
}

function set(patch: Partial<LearningData>): void {
  state = { ...state, ...patch };
  persist();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!state.hydrated) {
    hydrate();
    queueMicrotask(emit);
  }
  return () => listeners.delete(listener);
}

export function useLearning(): LearningState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export const learning = {
  addDrillTake(take: DrillTake, takeAudio: Blob | null = null): void {
    if (takeAudio) audio.set(take.id, takeAudio);
    set({ drillTakes: [...state.drillTakes, take] });
  },
  addRetry(retry: RetryRecord, takeAudio: Blob | null = null): void {
    if (takeAudio) audio.set(retry.id, takeAudio);
    set({ retries: [...state.retries, retry].slice(-MAX_RETRIES_STORED) });
  },
  addEarAttempt(attempt: EarAttempt): void {
    set({ earAttempts: [...state.earAttempts, attempt] });
  },
  setWeeklyTarget(target: number): void {
    set({ weeklyTarget: Math.min(7, Math.max(1, Math.round(target))) });
  },
  setSession(session: GuidedSession | null): void {
    set({ session });
  },
  completeStep(index: number): void {
    if (!state.session || state.session.done.includes(index)) return;
    set({ session: { ...state.session, done: [...state.session.done, index] } });
  },
  removeDemo(): void {
    set({
      drillTakes: state.drillTakes.filter((t) => t.source !== "demo"),
      retries: state.retries.filter((r) => r.source !== "demo"),
      earAttempts: state.earAttempts.filter((a) => a.source !== "demo"),
      session: state.session?.source === "demo" ? null : state.session,
    });
  },
  clear(): void {
    audio.clear();
    set({ drillTakes: [], retries: [], earAttempts: [], session: null });
  },
  importData(incoming: LearningData): void {
    const merged = mergeLearning(state, incoming);
    set({ drillTakes: merged.drillTakes, retries: merged.retries, earAttempts: merged.earAttempts });
  },
};

export function getLearningAudio(id: string): Blob | null {
  return audio.get(id) ?? null;
}
