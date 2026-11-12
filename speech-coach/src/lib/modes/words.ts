import { reviewState, type ReviewState } from "../learning/schedule";
import type { Observation } from "../learning/types";
import { normalizeWord } from "../text";
import type { ResultSource } from "../types";
import type { SavedWord } from "./types";

/** My words: vocabulary I chose to keep. Saved words get the same spaced review as sounds. */

export const MAX_BULK = 200;
const MAX_LENGTH = 40;

/** Clean one entry. Multi-word terms are kept ("go to market"). Empty or absurd entries become null. */
export function cleanEntry(raw: string): string | null {
  const text = raw.replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return text.length < 2 || text.length > MAX_LENGTH ? null : text;
}

/** Split pasted vocabulary: one entry per line, or separated by commas or semicolons. */
export function parseBulk(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const entry = cleanEntry(raw);
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
    if (out.length >= MAX_BULK) break;
  }
  return out;
}

/** Add entries that are not already saved. Returns the new list and how many were actually added. */
export function addWords(
  existing: readonly SavedWord[],
  entries: readonly string[],
  from: SavedWord["from"],
  source: ResultSource,
  now: Date,
  makeId: () => string,
): { words: SavedWord[]; added: number } {
  const have = new Set(existing.map((w) => w.word));
  const fresh: SavedWord[] = [];
  for (const raw of entries) {
    const word = cleanEntry(raw);
    if (!word || have.has(word)) continue;
    have.add(word);
    fresh.push({ id: makeId(), word, addedAt: now.toISOString(), from, source, reviews: [] });
  }
  return { words: [...existing, ...fresh], added: fresh.length };
}

export function isSaved(words: readonly SavedWord[], raw: string): boolean {
  const word = cleanEntry(raw);
  return word !== null && words.some((w) => w.word === word);
}

/** A word that has never been drilled is due at once. After that it follows the same stretching gaps as a sound. */
export function wordReview(word: SavedWord, now: Date): ReviewState | null {
  const scored = word.reviews.filter((r): r is { date: string; score: number } => r.score !== null);
  if (scored.length === 0) return null;
  // The first sighting of a saved word always starts its schedule, even when it was said well.
  const observations: Observation[] = [
    { phoneme: word.word, date: word.addedAt, average: 0, count: 1, context: "mixed" as const, scriptId: null },
    ...scored.map((r) => ({ phoneme: word.word, date: r.date, average: r.score, count: 1, context: "mixed" as const, scriptId: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return reviewState(observations, now);
}

export function isWordDue(word: SavedWord, now: Date): boolean {
  const state = wordReview(word, now);
  return state === null || state.due;
}

/** Saved words due for review. Never-drilled words first, then the most overdue. */
export function dueWords(words: readonly SavedWord[], now: Date): SavedWord[] {
  return words
    .map((word) => ({ word, state: wordReview(word, now) }))
    .filter((w) => w.state === null || w.state.due)
    .sort((a, b) => (a.state?.dueInDays ?? -9999) - (b.state?.dueInDays ?? -9999) || a.word.addedAt.localeCompare(b.word.addedAt))
    .map((w) => w.word);
}

/** Saved words known to contain a sound, to fold into that sound's drills. */
export function savedWordsWithSound(words: readonly SavedWord[], known: ReadonlySet<string>, max = 2): string[] {
  return words.filter((w) => known.has(normalizeWord(w.word))).slice(0, max).map((w) => w.word);
}

/** A short carrier line, so a single word is said inside real speech. */
export function carrierLine(word: string): string {
  return `${word}. I said ${word} clearly.`;
}
