import type { LongPause, PacingStats, WordResult } from "./types";

/** A silence between two words at least this long counts as a long pause. */
export const LONG_PAUSE_MS = 700;

type TimedWord = WordResult & { offsetMs: number; durationMs: number };

function isTimed(w: WordResult): w is TimedWord {
  return w.status !== "omission" && w.offsetMs !== null && w.durationMs !== null;
}

/** Words per minute and long pauses, from word timestamps. */
export function computePacing(words: readonly WordResult[], thresholdMs = LONG_PAUSE_MS): PacingStats {
  const timed = words.filter(isTimed).sort((a, b) => a.offsetMs - b.offsetMs);
  const first = timed[0];
  const last = timed[timed.length - 1];
  if (!first || !last) {
    return {
      wordsPerMinute: null,
      spokenWordCount: 0,
      spanMs: null,
      longPauses: [],
      longPauseThresholdMs: thresholdMs,
      estimated: false,
    };
  }

  const spanMs = last.offsetMs + last.durationMs - first.offsetMs;
  const longPauses: LongPause[] = [];
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1] as TimedWord;
    const cur = timed[i] as TimedWord;
    const gap = cur.offsetMs - (prev.offsetMs + prev.durationMs);
    if (gap >= thresholdMs) {
      longPauses.push({
        afterWordIndex: prev.index,
        beforeWordIndex: cur.index,
        durationMs: Math.round(gap),
        atSentenceBoundary:
          prev.sentenceIndex !== null && cur.sentenceIndex !== null && prev.sentenceIndex !== cur.sentenceIndex,
      });
    }
  }

  return {
    wordsPerMinute: spanMs > 0 ? Math.round((timed.length / spanMs) * 60_000) : null,
    spokenWordCount: timed.length,
    spanMs: Math.round(spanMs),
    longPauses,
    longPauseThresholdMs: thresholdMs,
    estimated: false,
  };
}

/** Transcript-only fallback: no word timestamps, so WPM is words over total recording time. */
export function estimatePacing(spokenWordCount: number, recordingMs: number): PacingStats {
  return {
    wordsPerMinute:
      recordingMs > 0 && spokenWordCount > 0 ? Math.round((spokenWordCount / recordingMs) * 60_000) : null,
    spokenWordCount,
    spanMs: recordingMs > 0 ? Math.round(recordingMs) : null,
    longPauses: null,
    longPauseThresholdMs: LONG_PAUSE_MS,
    estimated: true,
  };
}
