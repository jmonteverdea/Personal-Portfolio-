import type { PhonemeStat, ResultSource } from "../types";

/** Data for the coaching modes added after the redesign. Stored under one new key, beside everything else. */

export interface ScanRecord {
  id: string;
  date: string;
  source: ResultSource;
  /** Per-sound stats over the whole scan. */
  stats: Record<string, PhonemeStat>;
  accuracy: number | null;
  fluency: number | null;
  /** Prosody over the scan, with the word-stress sentences included. */
  prosody: number | null;
  parts: number;
}

export interface TalkWord {
  text: string;
  offsetMs: number | null;
  durationMs: number | null;
  accuracy: number | null;
  /** The weakest sound in the word, when sound data exists. */
  worst: { phoneme: string; accuracy: number; heardAs: string | null } | null;
}

export interface TalkTurn {
  role: "partner" | "me";
  text: string;
  /** My turns only. */
  words: TalkWord[];
  durationMs: number;
  /** Unscripted scores from Azure. Less precise than scripted ones. Null without Azure. */
  scores: { accuracy: number; fluency: number; prosody: number | null } | null;
}

export interface Rewording {
  original: string;
  suggestion: string;
  by: "claude" | "rules";
}

export interface TalkRecord {
  id: string;
  date: string;
  kind: "conversation" | "free";
  scenarioId: string;
  title: string;
  turns: TalkTurn[];
  source: ResultSource;
  rewording: Rewording | null;
}

/** "This was fine": my word against the score. Keeps what the word had contributed, so it can be taken back out. */
export interface Override {
  id: string;
  date: string;
  resultId: string;
  refIndex: number;
  word: string;
  contributions: { phoneme: string; accuracy: number }[];
}

export interface Thumb {
  id: string;
  date: string;
  /** Stable key of the note: section plus its text. */
  noteKey: string;
  text: string;
  vote: "up" | "down";
}

export interface SavedWord {
  id: string;
  word: string;
  addedAt: string;
  from: "saved" | "bulk" | "retry-cap";
  source: ResultSource;
  /** One entry per time the word was drilled. Score is null without Azure. */
  reviews: { date: string; score: number | null }[];
}

export interface SpeakingEvent {
  id: string;
  name: string;
  /** Local day of the event, YYYY-MM-DD. */
  day: string;
  scriptId: string;
  createdAt: string;
  /** Task ids ticked off. */
  done: string[];
}

export interface ShadowRecord {
  id: string;
  date: string;
  scriptId: string;
  sentence: string;
  /** Pitch range in semitones. Null when it could not be measured. */
  modelRange: number | null;
  myRange: number | null;
  flat: boolean;
  source: ResultSource;
}

export interface ModesSettings {
  /** Show a short Spanish hint beside each articulation instruction. */
  spanishHints: boolean;
}

export interface ModesData {
  version: 1;
  scans: ScanRecord[];
  talks: TalkRecord[];
  overrides: Override[];
  thumbs: Thumb[];
  words: SavedWord[];
  events: SpeakingEvent[];
  shadows: ShadowRecord[];
  settings: ModesSettings;
}

export const EMPTY_MODES: ModesData = {
  version: 1,
  scans: [],
  talks: [],
  overrides: [],
  thumbs: [],
  words: [],
  events: [],
  shadows: [],
  settings: { spanishHints: false },
};
