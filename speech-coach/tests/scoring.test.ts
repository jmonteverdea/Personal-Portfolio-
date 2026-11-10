import { describe, expect, it } from "vitest";
import { aggregateScores, durationWeighted, overallScore } from "@/lib/scoring";
import { computePacing, estimatePacing, LONG_PAUSE_MS } from "@/lib/pacing";
import { buildAssessmentResult } from "@/lib/azure/normalize";
import { DEMO_SCRIPT, demoSegments } from "@/lib/fixtures/demo";
import type { Segment, WordResult } from "@/lib/types";

const word = (over: Partial<WordResult>): WordResult => ({
  index: 0, text: "w", spoken: null, status: "correct", refIndex: 0, sentenceIndex: 0,
  accuracy: 100, offsetMs: 0, durationMs: 100, phonemes: [], prosody: null, ...over,
});
const segment = (durationMs: number, fluency: number, prosody: number | null, accuracy = 0): Segment => ({
  offsetMs: 0, durationMs, displayText: "", scores: { accuracy, fluency, completeness: 100, prosody }, words: [],
});

describe("overallScore (Azure formula)", () => {
  it("weights the lowest of four scores at 0.4", () => {
    expect(overallScore([90, 80, 100, 50])).toBeCloseTo(0.4 * 50 + 0.2 * (80 + 90 + 100));
  });
  it("weights the lowest of three scores at 0.6 when prosody is missing", () => {
    expect(overallScore([90, 60, 100])).toBeCloseTo(0.6 * 60 + 0.2 * (90 + 100));
  });
  it("returns 100 for perfect scores", () => {
    expect(overallScore([100, 100, 100, 100])).toBeCloseTo(100);
  });
});

describe("durationWeighted", () => {
  it("weights by duration", () => {
    expect(durationWeighted([{ value: 100, durationMs: 1000 }, { value: 50, durationMs: 3000 }])).toBe(62.5);
  });
  it("returns null with nothing to average", () => {
    expect(durationWeighted([])).toBeNull();
  });
});

describe("aggregateScores", () => {
  it("is not a naive average of segment scores", () => {
    // A 1-word, 1-second segment scored 100 and a 9-word, 9-second segment scored 50.
    const segments = [segment(1000, 100, 100, 100), segment(9000, 50, 50, 50)];
    const words = [
      word({ index: 0, refIndex: 0, accuracy: 100 }),
      ...Array.from({ length: 9 }, (_, i) => word({ index: i + 1, refIndex: i + 1, accuracy: 50 })),
    ];
    const s = aggregateScores(segments, words, 10);
    expect(s.accuracy).toBe(55); // word-weighted, naive would be 75
    expect(s.fluency).toBe(55); // duration-weighted, naive would be 75
    expect(s.prosody).toBe(55);
    expect(s.completeness).toBe(100);
    expect(s.overall).toBeCloseTo(0.4 * 55 + 0.2 * (55 + 55 + 100), 1);
  });

  it("computes completeness from script words spoken, ignoring insertions", () => {
    const words = [
      word({ index: 0, refIndex: 0 }),
      word({ index: 1, refIndex: null, status: "insertion", accuracy: 10 }),
      word({ index: 2, refIndex: 1, status: "mispronounced", accuracy: 40 }),
      word({ index: 3, refIndex: 2, status: "omission", accuracy: null, offsetMs: null, durationMs: null }),
      word({ index: 4, refIndex: 3, status: "omission", accuracy: null, offsetMs: null, durationMs: null }),
    ];
    const s = aggregateScores([segment(2000, 80, 70)], words, 4);
    expect(s.completeness).toBe(50);
    expect(s.accuracy).toBe(70); // (100 + 40) / 2: the insertion and omissions do not count
  });

  it("leaves prosody null when Azure returned none, and uses the 3-score formula", () => {
    const s = aggregateScores([segment(1000, 90, null)], [word({ accuracy: 80 })], 1);
    expect(s.prosody).toBeNull();
    expect(s.overall).toBeCloseTo(0.6 * 80 + 0.2 * (90 + 100), 1);
  });

  it("skips segments without prosody when weighting prosody", () => {
    const s = aggregateScores([segment(1000, 90, null), segment(1000, 90, 60)], [word({})], 1);
    expect(s.prosody).toBe(60);
  });

  it("returns zeros, not NaN, for an empty take", () => {
    const s = aggregateScores([], [], 5);
    expect(s).toEqual({ overall: 0, accuracy: 0, fluency: 0, completeness: 0, prosody: null });
  });

  it("matches a hand calculation on the multi-segment fixture", () => {
    const segs = demoSegments();
    const result = buildAssessmentResult(segs, {
      id: "x", createdAt: "2026-01-01T00:00:00.000Z", scriptId: "s", scriptTitle: "t", referenceText: DEMO_SCRIPT.text,
    });
    const total = segs.reduce((n, s) => n + s.durationMs, 0);
    const fluency = segs.reduce((n, s) => n + s.scores.fluency * s.durationMs, 0) / total;
    expect(result.scores?.fluency).toBeCloseTo(fluency, 1);
    expect(result.scores?.fluency).not.toBeCloseTo((88 + 81 + 74) / 3, 1);
    expect(result.scores?.completeness).toBeCloseTo((45 / 46) * 100, 1);
    const said = result.words.filter((w) => w.status === "correct" || w.status === "mispronounced");
    expect(said).toHaveLength(45);
    expect(result.scores?.accuracy).toBeCloseTo(said.reduce((n, w) => n + (w.accuracy ?? 0), 0) / 45, 1);
  });
});

describe("pacing", () => {
  it("computes words per minute over the spoken span", () => {
    // 4 words, first starts at 1000 ms, last ends at 3000 ms: 4 words in 2 s = 120 wpm
    const words = [0, 1, 2, 3].map((i) => word({ index: i, refIndex: i, offsetMs: 1000 + i * 500, durationMs: 500 }));
    const p = computePacing(words);
    expect(p.wordsPerMinute).toBe(120);
    expect(p.spanMs).toBe(2000);
    expect(p.spokenWordCount).toBe(4);
    expect(p.longPauses).toEqual([]);
    expect(p.estimated).toBe(false);
  });

  it("finds long pauses and says whether they sit on a sentence boundary", () => {
    const words = [
      word({ index: 0, offsetMs: 0, durationMs: 300, sentenceIndex: 0 }),
      word({ index: 1, offsetMs: 300 + LONG_PAUSE_MS, durationMs: 300, sentenceIndex: 0 }),
      word({ index: 2, offsetMs: 3000, durationMs: 300, sentenceIndex: 1 }),
      word({ index: 3, offsetMs: 3300 + LONG_PAUSE_MS - 1, durationMs: 300, sentenceIndex: 1 }),
    ];
    const p = computePacing(words);
    expect(p.longPauses).toEqual([
      { afterWordIndex: 0, beforeWordIndex: 1, durationMs: LONG_PAUSE_MS, atSentenceBoundary: false },
      { afterWordIndex: 1, beforeWordIndex: 2, durationMs: 3000 - (600 + LONG_PAUSE_MS), atSentenceBoundary: true },
    ]);
  });

  it("ignores omissions and counts insertions as spoken words", () => {
    const words = [
      word({ index: 0, offsetMs: 0, durationMs: 500 }),
      word({ index: 1, status: "omission", offsetMs: null, durationMs: null, accuracy: null }),
      word({ index: 2, status: "insertion", refIndex: null, sentenceIndex: null, offsetMs: 500, durationMs: 500 }),
    ];
    expect(computePacing(words).spokenWordCount).toBe(2);
    expect(computePacing(words).wordsPerMinute).toBe(120);
  });

  it("handles an empty take", () => {
    const p = computePacing([]);
    expect(p.wordsPerMinute).toBeNull();
    expect(p.longPauses).toEqual([]);
  });

  it("finds the planted pauses in the fixture", () => {
    const result = buildAssessmentResult(demoSegments(), {
      id: "x", createdAt: "2026-01-01T00:00:00.000Z", scriptId: "s", scriptTitle: "t", referenceText: DEMO_SCRIPT.text,
    });
    const pauses = result.pacing.longPauses ?? [];
    const before = pauses.map((p) => result.words[p.beforeWordIndex]?.text);
    expect(before).toEqual(["We", "three"]);
    expect(pauses[0]?.atSentenceBoundary).toBe(true);
    expect(pauses[1]?.atSentenceBoundary).toBe(false);
    expect(pauses[1]?.durationMs).toBe(1250);
    expect(result.pacing.wordsPerMinute).toBeGreaterThan(100);
    expect(result.pacing.wordsPerMinute).toBeLessThan(220);
  });

  it("estimates pace without timestamps", () => {
    expect(estimatePacing(50, 30_000).wordsPerMinute).toBe(100);
    expect(estimatePacing(0, 30_000).wordsPerMinute).toBeNull();
    expect(estimatePacing(10, 0).wordsPerMinute).toBeNull();
  });
});
