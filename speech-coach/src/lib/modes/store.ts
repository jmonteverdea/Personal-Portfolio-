"use client";

import { useSyncExternalStore } from "react";
import { mergeModes } from "./transfer";
import { EMPTY_MODES, type ModesData, type ModesSettings, type Override, type Rewording, type SavedWord, type ScanRecord, type ShadowRecord, type SpeakingEvent, type TalkRecord, type Thumb } from "./types";

/** Persistence for the coaching modes. One new localStorage key. Nothing existing is touched. */

const KEY = "speech-coach.modes.v1";
const MAX_TALKS = 20;
const MAX_THUMBS = 200;
const MAX_SHADOWS = 100;

interface ModesState extends ModesData {
  hydrated: boolean;
}

const SERVER: ModesState = { ...EMPTY_MODES, hydrated: false };
let state: ModesState = SERVER;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  try {
    const { hydrated: _hydrated, ...data } = state;
    void _hydrated;
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked. The modes keep working in memory.
  }
}

function hydrate(): void {
  if (state.hydrated || typeof window === "undefined") return;
  let stored: Partial<ModesData> = {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Partial<ModesData>;
  } catch {
    stored = {};
  }
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  state = {
    version: 1,
    scans: arr(stored.scans),
    talks: arr(stored.talks),
    overrides: arr(stored.overrides),
    thumbs: arr(stored.thumbs),
    words: arr(stored.words),
    events: arr(stored.events),
    shadows: arr(stored.shadows),
    settings: { spanishHints: stored.settings?.spanishHints === true },
    hydrated: true,
  };
}

function set(patch: Partial<ModesData>): void {
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

export function useModes(): ModesState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export const modes = {
  addScan(scan: ScanRecord): void {
    set({ scans: [...state.scans.filter((s) => s.id !== scan.id), scan] });
  },
  seedScans(scans: ScanRecord[]): void {
    const ids = new Set(state.scans.map((s) => s.id));
    set({ scans: [...state.scans, ...scans.filter((s) => !ids.has(s.id))] });
  },
  addTalk(talk: TalkRecord): void {
    set({ talks: [...state.talks.filter((t) => t.id !== talk.id), talk].slice(-MAX_TALKS) });
  },
  setRewording(talkId: string, rewording: Rewording): void {
    set({ talks: state.talks.map((t) => (t.id === talkId ? { ...t, rewording } : t)) });
  },
  addOverride(override: Override): void {
    set({ overrides: [...state.overrides.filter((o) => !(o.resultId === override.resultId && o.refIndex === override.refIndex)), override] });
  },
  removeOverride(resultId: string, refIndex: number): void {
    set({ overrides: state.overrides.filter((o) => !(o.resultId === resultId && o.refIndex === refIndex)) });
  },
  vote(thumb: Thumb): void {
    set({ thumbs: [...state.thumbs.filter((t) => t.noteKey !== thumb.noteKey), thumb].slice(-MAX_THUMBS) });
  },
  clearVote(noteKey: string): void {
    set({ thumbs: state.thumbs.filter((t) => t.noteKey !== noteKey) });
  },
  setWords(words: SavedWord[]): void {
    set({ words });
  },
  removeWord(id: string): void {
    set({ words: state.words.filter((w) => w.id !== id) });
  },
  addWordReview(word: string, score: number | null, date: string): void {
    set({ words: state.words.map((w) => (w.word === word ? { ...w, reviews: [...w.reviews, { date, score }] } : w)) });
  },
  saveEvent(event: SpeakingEvent): void {
    set({ events: [...state.events.filter((e) => e.id !== event.id), event] });
  },
  deleteEvent(id: string): void {
    set({ events: state.events.filter((e) => e.id !== id) });
  },
  toggleEventTask(eventId: string, taskId: string): void {
    set({
      events: state.events.map((e) => (e.id !== eventId ? e : { ...e, done: e.done.includes(taskId) ? e.done.filter((d) => d !== taskId) : [...e.done, taskId] })),
    });
  },
  addShadow(record: ShadowRecord): void {
    set({ shadows: [...state.shadows, record].slice(-MAX_SHADOWS) });
  },
  setSetting<K extends keyof ModesSettings>(key: K, value: ModesSettings[K]): void {
    set({ settings: { ...state.settings, [key]: value } });
  },
  removeDemo(): void {
    set({
      scans: state.scans.filter((s) => s.source !== "demo"),
      talks: state.talks.filter((t) => t.source !== "demo"),
      words: state.words.filter((w) => w.source !== "demo"),
      shadows: state.shadows.filter((s) => s.source !== "demo"),
      overrides: state.overrides.filter((o) => !o.resultId.startsWith("demo-")),
      events: state.events.filter((e) => !e.scriptId.startsWith("demo-")),
    });
  },
  clear(): void {
    set({ scans: [], talks: [], overrides: [], shadows: [] });
  },
  importData(incoming: ModesData): void {
    const merged = mergeModes(state, incoming);
    set({ ...merged });
  },
};
