"use client";

import { useSyncExternalStore } from "react";
import type { Coaching } from "./coach/schema";
import { buildDemoResult, buildDemoSessions, DEMO_COACHING, DEMO_RESULT_ID, DEMO_SCRIPT } from "./fixtures/demo";
import { mergeById, summarizeSession } from "./history";
import type { AssessmentResult, HistoryExport, Script, ScriptTag, SessionRecord } from "./types";

/**
 * Client-side state, persisted to localStorage. One external store so every
 * screen reads the same data and server rendering stays deterministic.
 */

const KEYS = {
  scripts: "speech-coach.scripts.v1",
  sessions: "speech-coach.sessions.v1",
  results: "speech-coach.results.v1",
  coaching: "speech-coach.coaching.v1",
} as const;

/** Full results are large, so only the most recent few are kept for re-opening. */
const MAX_STORED_RESULTS = 8;

export interface StoreState {
  /** False on the server and until localStorage has been read. */
  hydrated: boolean;
  scripts: Script[];
  sessions: SessionRecord[];
  results: Record<string, AssessmentResult>;
  coaching: Record<string, Coaching>;
  /** Set when a write to localStorage failed (quota, private mode). */
  storageError: string | null;
}

const EMPTY: StoreState = {
  hydrated: false,
  scripts: [],
  sessions: [],
  results: {},
  coaching: {},
  storageError: null,
};

const STARTER_SCRIPTS: Omit<Script, "createdAt" | "updatedAt">[] = [
  {
    id: "starter-standup",
    title: "Project status update",
    tags: ["meeting"],
    text: "Quick update from my side. We finished the vendor evaluation this week and shortlisted three providers. The best option is thirty percent cheaper, but it needs a longer setup. I would like a decision by Thursday so we can keep the launch date. The main risk is the security review, which is still open.",
  },
  {
    id: "starter-pushback",
    title: "Pushing back on a deadline",
    tags: ["difficult conversation"],
    text: "I want to be direct about the timeline. With the current scope, shipping by the fifteenth means skipping the final round of testing, and I do not think that is a risk we should take. I see two options. We can move the date by two weeks, or we can ship on time with a smaller feature set. Which matters more to you?",
  },
  {
    id: "starter-presentation",
    title: "Opening a presentation",
    tags: ["presentation"],
    text: "Thank you all for being here. Over the next ten minutes, I will walk you through three things: what we learned this quarter, where the numbers surprised us, and what we think we should do next. Please hold your questions until the end. Let us start with the results.",
  },
];

let state: StoreState = EMPTY;
const listeners = new Set<() => void>();
/** Audio of takes recorded in this tab. Blobs cannot go to localStorage. */
const audio = new Map<string, Blob>();

function emit(): void {
  for (const l of listeners) l();
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): string | null {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch {
    return "Could not save to browser storage. It may be full or blocked. Export your history to keep it.";
  }
}

function set(patch: Partial<StoreState>, persist: (keyof typeof KEYS)[] = []): void {
  state = { ...state, ...patch };
  let storageError: string | null = null;
  for (const key of persist) storageError = write(KEYS[key], state[key]) ?? storageError;
  if (persist.length > 0) state = { ...state, storageError };
  emit();
}

function hydrate(): void {
  if (state.hydrated || typeof window === "undefined") return;
  const now = new Date().toISOString();
  const stored = read<Script[] | null>(KEYS.scripts, null);
  const scripts = stored ?? STARTER_SCRIPTS.map((s) => ({ ...s, createdAt: now, updatedAt: now }));
  state = {
    hydrated: true,
    scripts,
    sessions: read<SessionRecord[]>(KEYS.sessions, []),
    results: read<Record<string, AssessmentResult>>(KEYS.results, {}),
    coaching: read<Record<string, Coaching>>(KEYS.coaching, {}),
    storageError: stored === null ? write(KEYS.scripts, scripts) : null,
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!state.hydrated) {
    hydrate();
    queueMicrotask(emit);
  }
  return () => listeners.delete(listener);
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimResults(results: Record<string, AssessmentResult>): Record<string, AssessmentResult> {
  const keep = Object.values(results)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_STORED_RESULTS);
  return Object.fromEntries(keep.map((r) => [r.id, r]));
}

function trimCoaching(coaching: Record<string, Coaching>, results: Record<string, AssessmentResult>): Record<string, Coaching> {
  return Object.fromEntries(Object.entries(coaching).filter(([id]) => id in results));
}

export const actions = {
  saveScript(input: { id?: string; title: string; text: string; tags: ScriptTag[] }): Script {
    const now = new Date().toISOString();
    const existing = input.id ? state.scripts.find((s) => s.id === input.id) : undefined;
    const script: Script = {
      id: existing?.id ?? input.id ?? newId("script"),
      title: input.title.trim() || "Untitled script",
      text: input.text.trim(),
      tags: input.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const scripts = existing
      ? state.scripts.map((s) => (s.id === script.id ? script : s))
      : [script, ...state.scripts];
    set({ scripts }, ["scripts"]);
    return script;
  },

  deleteScript(id: string): void {
    set({ scripts: state.scripts.filter((s) => s.id !== id) }, ["scripts"]);
  },

  /** Store a finished take: summary in history, full result for re-opening, audio in memory. */
  saveResult(result: AssessmentResult, takeAudio: Blob | null): void {
    if (takeAudio) audio.set(result.id, takeAudio);
    const results = trimResults({ ...state.results, [result.id]: result });
    set(
      {
        sessions: [...state.sessions.filter((s) => s.id !== result.id), summarizeSession(result)],
        results,
        coaching: trimCoaching(state.coaching, results),
      },
      ["sessions", "results", "coaching"],
    );
  },

  saveCoaching(resultId: string, coaching: Coaching): void {
    set({ coaching: { ...state.coaching, [resultId]: coaching } }, ["coaching"]);
  },

  /** Demo mode: the sample take, its coaching and a short history. Safe to call twice. */
  loadDemo(): string {
    const result = buildDemoResult();
    const results = trimResults({ ...state.results, [result.id]: result });
    set(
      {
        scripts: mergeById(state.scripts, [DEMO_SCRIPT]),
        sessions: mergeById(state.sessions, buildDemoSessions()),
        results,
        coaching: { ...trimCoaching(state.coaching, results), [result.id]: DEMO_COACHING },
      },
      ["scripts", "sessions", "results", "coaching"],
    );
    return DEMO_RESULT_ID;
  },

  removeDemo(): void {
    const results = Object.fromEntries(Object.entries(state.results).filter(([, r]) => r.source !== "demo"));
    set(
      {
        scripts: state.scripts.filter((s) => s.id !== DEMO_SCRIPT.id),
        sessions: state.sessions.filter((s) => s.source !== "demo"),
        results,
        coaching: trimCoaching(state.coaching, results),
      },
      ["scripts", "sessions", "results", "coaching"],
    );
  },

  deleteSession(id: string): void {
    audio.delete(id);
    const results = Object.fromEntries(Object.entries(state.results).filter(([key]) => key !== id));
    set(
      { sessions: state.sessions.filter((s) => s.id !== id), results, coaching: trimCoaching(state.coaching, results) },
      ["sessions", "results", "coaching"],
    );
  },

  clearHistory(): void {
    audio.clear();
    set({ sessions: [], results: {}, coaching: {} }, ["sessions", "results", "coaching"]);
  },

  importHistory(data: HistoryExport): { sessions: number; scripts: number } {
    const sessions = mergeById(state.sessions, data.sessions);
    const scripts = mergeById(state.scripts, data.scripts);
    const added = { sessions: sessions.length - state.sessions.length, scripts: scripts.length - state.scripts.length };
    set({ sessions, scripts }, ["sessions", "scripts"]);
    return added;
  },
};

export function getTakeAudio(resultId: string): Blob | null {
  return audio.get(resultId) ?? null;
}
