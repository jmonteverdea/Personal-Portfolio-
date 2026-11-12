import { guideFor } from "../coach/local";
import type { PhonemeResult, PhonemeStat } from "../types";
import { CLEAR } from "./scan";
import type { Override, Thumb } from "./types";

/**
 * Score trust. A score is only useful if I believe it and can act on it, so:
 * clear is a threshold and not 100, retries are capped, a low score is only
 * shown as an error when it comes with something physical to change, and my
 * own "this was fine" overrides the machine.
 */

export { CLEAR };

/** Tries allowed on one word, sentence or drill stage before the app moves on. */
export const MAX_TRIES = 3;

export function isClear(score: number | null): boolean {
  return score !== null && Math.round(score) >= CLEAR;
}

export type TryState = "clear" | "again" | "capped";

/** After a try: stop because it is clear, offer another try, or stop because three is enough. */
export function tryState(score: number | null, triesUsed: number): TryState {
  if (isClear(score)) return "clear";
  return triesUsed >= MAX_TRIES ? "capped" : "again";
}

export function triesLeft(triesUsed: number): number {
  return Math.max(0, MAX_TRIES - triesUsed);
}

export interface Explanation {
  phoneme: string;
  accuracy: number;
  heardAs: string | null;
  /** What to change with the tongue, lips, jaw or air. */
  instruction: string;
}

/**
 * What to physically change for a low word: the instruction for its weakest sound.
 * Null when there is nothing specific to say, in which case the word is not shown as an error.
 */
export function explainLowWord(phonemes: readonly Pick<PhonemeResult, "phoneme" | "accuracy" | "alternatives">[]): Explanation | null {
  const worst = [...phonemes].filter((p) => p.accuracy < CLEAR).sort((a, b) => a.accuracy - b.accuracy)[0];
  if (!worst) return null;
  const guide = guideFor(worst.phoneme);
  if (!guide) return null;
  const top = worst.alternatives[0];
  const heardAs = top && top.phoneme !== worst.phoneme ? top.phoneme : null;
  const habit = heardAs ? guide.habits?.[heardAs] : undefined;
  return { phoneme: worst.phoneme, accuracy: worst.accuracy, heardAs, instruction: habit ? `${guide.how} ${habit}` : guide.how };
}

/** A word is flagged as an error only when it is low, I have not overridden it, and there is something to change. */
export function shouldFlag(
  word: { accuracy: number | null; phonemes: readonly Pick<PhonemeResult, "phoneme" | "accuracy" | "alternatives">[] },
  overridden: boolean,
): boolean {
  if (overridden || word.accuracy === null || isClear(word.accuracy)) return false;
  return explainLowWord(word.phonemes) !== null;
}

/** What a word put into the sound stats, kept so an override can take it back out later. */
export function contributionsOf(phonemes: readonly Pick<PhonemeResult, "phoneme" | "accuracy">[]): Override["contributions"] {
  return phonemes.map((p) => ({ phoneme: p.phoneme, accuracy: p.accuracy }));
}

/** Sound stats of one take with my overridden words taken out, so they stop counting against mastery. */
export function applyOverrides(stats: Readonly<Record<string, PhonemeStat>>, overrides: readonly Override[]): Record<string, PhonemeStat> {
  const out: Record<string, PhonemeStat> = {};
  for (const [phoneme, s] of Object.entries(stats)) out[phoneme] = { ...s };
  for (const override of overrides) {
    for (const c of override.contributions) {
      const stat = out[c.phoneme];
      if (!stat || stat.count <= 0) continue;
      stat.count -= 1;
      stat.sum = Math.max(0, stat.sum - c.accuracy);
      if (c.accuracy < 60) stat.lowCount = Math.max(0, stat.lowCount - 1);
      stat.examples = stat.examples.filter((e) => e.toLowerCase() !== override.word.toLowerCase());
      if (stat.count === 0) delete out[c.phoneme];
    }
  }
  return out;
}

export function noteKey(section: string, text: string): string {
  return `${section}:${text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120)}`;
}

/** The latest vote per note. A later vote replaces an earlier one. */
export function latestVotes(thumbs: readonly Thumb[]): Map<string, Thumb> {
  const byKey = new Map<string, Thumb>();
  for (const t of [...thumbs].sort((a, b) => a.date.localeCompare(b.date))) byKey.set(t.noteKey, t);
  return byKey;
}

/** Text of the notes I most recently marked as not useful, newest first, for the coach prompt. */
export function recentDislikes(thumbs: readonly Thumb[], max = 8): string[] {
  return [...latestVotes(thumbs).values()]
    .filter((t) => t.vote === "down")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max)
    .map((t) => t.text.slice(0, 240));
}
