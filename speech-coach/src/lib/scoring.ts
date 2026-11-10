import type { Scores, Segment, WordResult } from "./types";

/** Azure marks a word as mispronounced below this accuracy. */
export const MISPRONOUNCED_BELOW = 60;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** Mean of segment scores weighted by how long each segment lasted. */
export function durationWeighted(items: readonly { value: number; durationMs: number }[]): number | null {
  let total = 0;
  let weight = 0;
  for (const { value, durationMs } of items) {
    const w = Math.max(durationMs, 1);
    total += value * w;
    weight += w;
  }
  return weight > 0 ? total / weight : null;
}

/**
 * Azure's published overall formula: sort the available scores low to high,
 * weight the lowest most. With prosody: 0.4, 0.2, 0.2, 0.2. Without: 0.6, 0.2, 0.2.
 */
export function overallScore(parts: readonly number[]): number {
  const s = [...parts].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  if (s.length === 1) return s[0] as number;
  const lowestWeight = s.length >= 4 ? 0.4 : 0.6;
  const restWeight = (1 - lowestWeight) / (s.length - 1);
  return s.reduce((sum, v, i) => sum + v * (i === 0 ? lowestWeight : restWeight), 0);
}

/**
 * One set of scores for the whole take, from many continuous-recognition segments.
 *
 * - accuracy: mean word accuracy over the script words I actually said. This equals a
 *   word-weighted mean of segment accuracy, and insertions do not count.
 * - fluency, prosody: Azure only reports these per segment, so they are weighted by segment duration.
 * - completeness: script words spoken / script words. Per-segment completeness is meaningless
 *   in continuous mode because each segment only sees part of the script.
 * - overall: Azure's formula applied to the aggregates.
 */
export function aggregateScores(
  segments: readonly Segment[],
  words: readonly WordResult[],
  referenceWordCount: number,
): Scores {
  const spoken = words.filter((w) => w.status === "correct" || w.status === "mispronounced");
  const scored = spoken.filter((w): w is WordResult & { accuracy: number } => w.accuracy !== null);

  const accuracy = scored.length > 0 ? scored.reduce((sum, w) => sum + w.accuracy, 0) / scored.length : 0;
  const fluency =
    durationWeighted(segments.map((s) => ({ value: s.scores.fluency, durationMs: s.durationMs }))) ?? 0;
  const prosody = durationWeighted(
    segments.flatMap((s) => (s.scores.prosody === null ? [] : [{ value: s.scores.prosody, durationMs: s.durationMs }])),
  );
  const completeness = referenceWordCount > 0 ? clamp((spoken.length / referenceWordCount) * 100) : 0;

  const parts = prosody === null ? [accuracy, fluency, completeness] : [accuracy, fluency, completeness, prosody];
  return {
    overall: round1(clamp(overallScore(parts))),
    accuracy: round1(clamp(accuracy)),
    fluency: round1(clamp(fluency)),
    completeness: round1(completeness),
    prosody: prosody === null ? null : round1(clamp(prosody)),
  };
}
