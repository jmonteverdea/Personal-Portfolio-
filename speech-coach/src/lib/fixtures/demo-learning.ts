import { buildAssessmentResult } from "../azure/normalize";
import type { DrillStage } from "../learning/types";
import { normalizeWord, splitWords } from "../text";
import type { AssessmentResult, Segment, SegmentWord, WordResult } from "../types";
import { DEMO_SCRIPT, demoSegments } from "./demo";

/**
 * Simulated takes for Demo mode, so a whole guided session can be walked with
 * no keys and no microphone. Everything built here is marked source "demo".
 * The shapes go through the same normalizer as a live take.
 */

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Target-sound score a simulated drill lands on, by stage: it gets better as the drill narrows in. */
const STAGE_SCORE: Record<DrillStage, number> = { pairs: 74, mixed: 81, sentences: 86 };

/** A simulated drill take. Words known to hold the target sound carry a score for it. */
export function simulateDrillTake(
  text: string,
  phoneme: string,
  stage: DrillStage,
  /** Normalized words known to contain the sound. */
  targets: ReadonlySet<string>,
  id: string,
  now: Date,
): AssessmentResult {
  const spoken = splitWords(text);
  let cursor = 400;
  const words: SegmentWord[] = spoken.map((raw, i) => {
    const norm = normalizeWord(raw);
    const hasTarget = targets.has(norm);
    const wobble = ((i * 7) % 9) - 4;
    const score = hasTarget ? clamp(STAGE_SCORE[stage] + wobble) : clamp(93 + (wobble % 4));
    const durationMs = 260 + (norm.length % 4) * 40;
    const word: SegmentWord = {
      text: norm,
      accuracy: score,
      azureErrorType: score < 60 ? "Mispronunciation" : "None",
      offsetMs: cursor,
      durationMs,
      phonemes: hasTarget ? [{ phoneme, accuracy: score, offsetMs: cursor, durationMs: 90, alternatives: [] }] : [],
      prosody: null,
    };
    cursor += durationMs + 120;
    return word;
  });
  const segment: Segment = {
    offsetMs: 400,
    durationMs: cursor - 400,
    displayText: text,
    scores: { accuracy: 88, fluency: 90, completeness: 100, prosody: 84 },
    words,
  };
  return buildAssessmentResult(
    [segment],
    { id, createdAt: now.toISOString(), scriptId: `drill-${phoneme}`, scriptTitle: `Drill /${phoneme}/`, referenceText: text },
    "demo",
  );
}

/** A simulated new take of the sample script, a little better than the last one. */
export function simulateScriptTake(id: string, now: Date, lift = 7): AssessmentResult {
  const segments: Segment[] = demoSegments().map((s) => ({
    ...s,
    scores: { ...s.scores, fluency: clamp(s.scores.fluency + 4), prosody: s.scores.prosody === null ? null : clamp(s.scores.prosody + 6) },
    words: s.words.map((w) => ({
      ...w,
      accuracy: w.accuracy === null ? null : clamp(w.accuracy + (w.accuracy < 80 ? lift * 1.6 : 2)),
      azureErrorType: w.accuracy !== null && w.accuracy + lift * 1.6 >= 60 ? "None" : w.azureErrorType,
      phonemes: w.phonemes.map((p) => ({ ...p, accuracy: clamp(p.accuracy + (p.accuracy < 80 ? lift * 2 : 1)) })),
    })),
  }));
  return buildAssessmentResult(
    segments,
    { id, createdAt: now.toISOString(), scriptId: DEMO_SCRIPT.id, scriptTitle: DEMO_SCRIPT.title, referenceText: DEMO_SCRIPT.text },
    "demo",
  );
}

/** Simulated second attempt at a word or sentence: weak words improve most. */
export function simulateRetryScores(words: readonly WordResult[]): (number | null)[] {
  return words.map((w, i) => {
    if (w.accuracy === null) return 88;
    const gain = w.accuracy < 60 ? 24 : w.accuracy < 80 ? 12 : 2;
    return clamp(w.accuracy + gain - (i % 3));
  });
}
