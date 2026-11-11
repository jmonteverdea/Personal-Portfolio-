import type { PhonemeStat, ResultSource } from "../types";

/** Types for the learning layer. Everything here is derived from, or stored beside, the existing history. */

/** Where a sound was heard. Only "sentences" and "script" count as real speech. */
export type PracticeContext = "pairs" | "mixed" | "sentences" | "script";

export const DRILL_STAGES = ["pairs", "mixed", "sentences"] as const;
export type DrillStage = (typeof DRILL_STAGES)[number];

/** One scored sighting of one sound. */
export interface Observation {
  phoneme: string;
  /** ISO date-time. */
  date: string;
  /** Mean accuracy of the sound in that take, 0 to 100. */
  average: number;
  count: number;
  context: PracticeContext;
  /** Script the take came from, when it was a script take. */
  scriptId: string | null;
}

/** A drill take. Stored under the learning key, never in the session history. */
export interface DrillTake {
  id: string;
  date: string;
  phoneme: string;
  stage: DrillStage;
  source: ResultSource;
  text: string;
  phonemeStats: Record<string, PhonemeStat>;
}

export interface RetryRecord {
  id: string;
  date: string;
  resultId: string;
  kind: "word" | "sentence";
  /** Script word index for a word retry, sentence index for a sentence retry. */
  targetIndex: number;
  text: string;
  /** Mean accuracy of the part before and after. Null when the take had no scores. */
  before: number | null;
  after: number | null;
  /** Per-word outcome of the retry, for the side-by-side view. */
  words: { text: string; before: number | null; after: number | null; status: string }[];
  source: ResultSource;
}

export interface EarAttempt {
  id: string;
  date: string;
  phoneme: string;
  rounds: number;
  correct: number;
  engine: "azure" | "browser";
  source: ResultSource;
}

export type SessionStep =
  | { kind: "review"; phoneme: string }
  | { kind: "ear"; phoneme: string }
  | { kind: "script"; scriptId: string };

export interface GuidedSession {
  id: string;
  /** Local calendar day the session was planned for, YYYY-MM-DD. */
  day: string;
  startedAt: string;
  steps: SessionStep[];
  /** Indexes of finished steps. */
  done: number[];
  source: ResultSource;
}

/** Everything the learning layer persists. One new localStorage key. */
export interface LearningData {
  version: 1;
  drillTakes: DrillTake[];
  retries: RetryRecord[];
  earAttempts: EarAttempt[];
  /** Practice days per week I am aiming for. */
  weeklyTarget: number;
  session: GuidedSession | null;
}

export const EMPTY_LEARNING: LearningData = {
  version: 1,
  drillTakes: [],
  retries: [],
  earAttempts: [],
  weeklyTarget: 4,
  session: null,
};

const DAY_MS = 86_400_000;

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole calendar days from a to b (b later is positive), in local time. */
export function daysBetween(a: Date | string, b: Date | string): number {
  const start = new Date(typeof a === "string" ? a : a.getTime());
  const end = new Date(typeof b === "string" ? b : b.getTime());
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function addDays(date: Date | string, days: number): Date {
  const d = new Date(typeof date === "string" ? date : date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
