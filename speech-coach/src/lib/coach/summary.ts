import type { AssessmentResult, WeakSound, WordResult } from "../types";
import { PHONEME_LOW_BELOW, WEAK_SOUND_BELOW } from "../history";
import type { CoachSummary } from "./schema";

/**
 * The compact payload sent to Claude. Built from the AssessmentResult only:
 * the raw Azure JSON never reaches the coach route.
 */

const MAX_LOW_WORDS = 10;
const MAX_WEAK_PHONEMES = 8;
const LOW_WORD_BELOW = 80;

const bare = (text: string): string => text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
const round = (n: number): number => Math.round(n);

/** The sound Azure heard instead, when its best guess is not the expected phoneme. */
function heardInstead(expected: string, alternatives: readonly { phoneme: string; score: number }[]): string | null {
  const top = alternatives[0];
  return top && top.phoneme !== expected ? top.phoneme : null;
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function buildCoachSummary(result: AssessmentResult, recurring: readonly WeakSound[]): CoachSummary {
  const said = result.words.filter((w) => w.status === "correct" || w.status === "mispronounced");
  const byIndex = new Map<number, WordResult>(result.words.map((w) => [w.index, w]));

  const sentences = result.sentences.map((text, i) => {
    const scored = said.filter((w) => w.sentenceIndex === i && w.accuracy !== null);
    return {
      n: i + 1,
      text,
      accuracy: scored.length ? round(scored.reduce((sum, w) => sum + (w.accuracy ?? 0), 0) / scored.length) : null,
    };
  });

  const lowWords = said
    .filter((w): w is WordResult & { accuracy: number } => w.accuracy !== null && w.accuracy < LOW_WORD_BELOW)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, MAX_LOW_WORDS)
    .map((w) => ({
      word: bare(w.text),
      sentence: (w.sentenceIndex ?? 0) + 1,
      score: round(w.accuracy),
      phonemes: w.phonemes
        .filter((p) => p.accuracy < LOW_WORD_BELOW)
        .slice(0, 12)
        .map((p) => ({ expected: p.phoneme, score: round(p.accuracy), heard: heardInstead(p.phoneme, p.alternatives) })),
    }));

  const perPhoneme = new Map<string, { sum: number; count: number; heard: string[]; words: { word: string; score: number }[] }>();
  for (const w of said) {
    for (const p of w.phonemes) {
      const entry = perPhoneme.get(p.phoneme) ?? { sum: 0, count: 0, heard: [], words: [] };
      entry.sum += p.accuracy;
      entry.count += 1;
      if (p.accuracy < PHONEME_LOW_BELOW + 10) {
        const heard = heardInstead(p.phoneme, p.alternatives);
        if (heard) entry.heard.push(heard);
        entry.words.push({ word: bare(w.text), score: p.accuracy });
      }
      perPhoneme.set(p.phoneme, entry);
    }
  }
  const weakPhonemes = [...perPhoneme.entries()]
    .map(([sound, e]) => ({ sound, average: e.sum / e.count, e }))
    .filter((p) => p.average < WEAK_SOUND_BELOW && p.e.words.length > 0)
    .sort((a, b) => a.average - b.average)
    .slice(0, MAX_WEAK_PHONEMES)
    .map(({ sound, average, e }) => ({
      sound,
      average: round(average),
      count: e.count,
      heardAs: mostCommon(e.heard),
      words: [...new Set(e.words.sort((a, b) => a.score - b.score).map((x) => x.word))].slice(0, 5),
    }));

  const previousSpoken = (index: number): string | null => {
    for (let i = index - 1; i >= 0; i--) {
      const w = byIndex.get(i);
      if (w && w.status !== "omission") return bare(w.text);
    }
    return null;
  };

  const monotone = new Set<number>();
  for (const w of said) if (w.prosody?.monotone && w.sentenceIndex !== null) monotone.add(w.sentenceIndex + 1);

  return {
    source: result.source,
    sentences,
    scores: result.scores,
    lowWords,
    weakPhonemes,
    miscues: {
      omitted: result.words
        .filter((w) => w.status === "omission")
        .slice(0, 40)
        .map((w) => ({ word: bare(w.text), sentence: (w.sentenceIndex ?? 0) + 1 })),
      inserted: result.words
        .filter((w) => w.status === "insertion")
        .slice(0, 40)
        .map((w) => ({ word: bare(w.text), after: previousSpoken(w.index) })),
      substituted: result.words
        .filter((w) => w.status === "mispronounced" && w.spoken !== null)
        .slice(0, 40)
        .map((w) => ({ expected: bare(w.text), said: w.spoken ?? "" })),
    },
    pacing: {
      wordsPerMinute: result.pacing.wordsPerMinute,
      estimated: result.pacing.estimated,
      longPauses:
        result.pacing.longPauses?.slice(0, 30).map((p) => {
          const before = byIndex.get(p.beforeWordIndex);
          return {
            ms: p.durationMs,
            after: bare(byIndex.get(p.afterWordIndex)?.text ?? ""),
            before: bare(before?.text ?? ""),
            sentence: before?.sentenceIndex != null ? before.sentenceIndex + 1 : null,
            midSentence: !p.atSentenceBoundary,
          };
        }) ?? null,
    },
    intonation: {
      monotoneSentences: [...monotone].sort((a, b) => a - b),
      unexpectedBreaksBefore: said.filter((w) => w.prosody?.unexpectedBreak).slice(0, 30).map((w) => bare(w.text)),
      missingBreaksBefore: said.filter((w) => w.prosody?.missingBreak).slice(0, 30).map((w) => bare(w.text)),
    },
    recurringWeakSounds: recurring
      .filter((s) => s.averageAccuracy < WEAK_SOUND_BELOW)
      .slice(0, 8)
      .map((s) => ({ sound: s.phoneme, average: round(s.averageAccuracy), sessions: s.sessions, examples: s.examples.slice(0, 4) })),
  };
}
