import { isRealSpeech } from "./observations";
import { GOOD, SLIP } from "./schedule";
import { dayKey, daysBetween, type Observation } from "./types";

/**
 * Mastery per sound. Four stages, earned only by holding scores across spaced
 * sessions, and the top one only in real sentences. A slip drops one stage.
 */

export type MasteryLevel = 0 | 1 | 2 | 3 | 4;

export const MASTERY_NAMES: Record<MasteryLevel, string> = {
  0: "Unmapped",
  1: "Finding",
  2: "Shaping",
  3: "Holding",
  4: "Owned",
};

export const MASTERY_RULES: Record<MasteryLevel, string> = {
  0: "Not heard yet.",
  1: "Heard, not yet reliable.",
  2: "Fair or better on the last two takes.",
  3: "Good on two separate days.",
  4: "Good in real sentences on two separate days.",
};

/** How many recent observations a stage is judged on. */
const WINDOW = 5;

/** Good observations on at least two calendar days that are at least `gap` days apart. */
function goodOnSpacedDays(observations: readonly Observation[], gap: number): boolean {
  const days = [...new Set(observations.filter((o) => o.average >= GOOD).map((o) => dayKey(o.date)))].sort();
  const first = days[0];
  const lastDay = days[days.length - 1];
  return first !== undefined && lastDay !== undefined && daysBetween(first, lastDay) >= gap;
}

function climb(observations: readonly Observation[]): MasteryLevel {
  const latest = observations[observations.length - 1];
  if (!latest) return 0;
  const recent = observations.slice(-WINDOW);
  const previous = observations[observations.length - 2];

  const shaping = latest.average >= GOOD || (previous !== undefined && previous.average >= SLIP && latest.average >= SLIP);
  if (!shaping) return 1;

  const holding = goodOnSpacedDays(recent, 1);
  if (!holding) return 2;

  const real = observations.filter(isRealSpeech).slice(-WINDOW);
  const latestReal = real[real.length - 1];
  const owned = latestReal !== undefined && latestReal.average >= GOOD && goodOnSpacedDays(real, 1);
  return owned ? 4 : 3;
}

/** Stage for one sound from its observations, oldest first. */
export function masteryLevel(observations: readonly Observation[]): MasteryLevel {
  const latest = observations[observations.length - 1];
  if (!latest) return 0;
  if (latest.average < SLIP && observations.length > 1) {
    // A slip costs one stage from wherever the sound stood before it.
    const before = masteryLevel(observations.slice(0, -1));
    return Math.max(1, before - 1) as MasteryLevel;
  }
  return climb(observations);
}

/** What it takes to reach the next stage, in plain words. Null at the top. */
export function nextStageHint(observations: readonly Observation[]): string | null {
  const level = masteryLevel(observations);
  if (level === 0) return "Record a take that contains this sound.";
  if (level === 1) return "Score 60 or more on two takes in a row, or 80 once.";
  if (level === 2) return "Score 80 or more on two different days.";
  if (level === 3) return "Score 80 or more in real sentences on two different days.";
  return null;
}
