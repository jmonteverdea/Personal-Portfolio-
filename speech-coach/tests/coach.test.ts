import { describe, expect, it } from "vitest";
import {
  CoachRequestSchema, CoachSummarySchema, DrillSchema, extractJson, parseCoaching, parseModelJson, ScenarioSchema,
} from "@/lib/coach/schema";
import { buildCoachSummary } from "@/lib/coach/summary";
import { aggregateWeakSounds } from "@/lib/history";
import { buildDemoResult, buildDemoSessions, DEMO_COACHING, DEMO_SCRIPT } from "@/lib/fixtures/demo";
import { buildTranscriptResult } from "@/lib/azure/normalize";
import { normalizeWords } from "@/lib/text";

const valid = JSON.stringify(DEMO_COACHING);

describe("coach response validation", () => {
  it("accepts a valid response", () => {
    const r = parseCoaching(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.priorities).toHaveLength(3);
  });

  it("accepts JSON wrapped in a code fence or prose", () => {
    expect(parseCoaching("```json\n" + valid + "\n```").ok).toBe(true);
    expect(parseCoaching("Here is the coaching:\n" + valid + "\nHope it helps.").ok).toBe(true);
    expect(extractJson("no braces here")).toBeNull();
  });

  it("rejects invalid JSON with a readable error", () => {
    const r = parseCoaching(valid.slice(0, -20));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON|no JSON/);
    expect(parseCoaching("I cannot help with that.").ok).toBe(false);
    expect(parseCoaching("").ok).toBe(false);
  });

  it("rejects more than 3 priorities, and none", () => {
    const p = DEMO_COACHING.priorities[0]!;
    const four = parseCoaching(JSON.stringify({ ...DEMO_COACHING, priorities: [p, p, p, p] }));
    expect(four.ok).toBe(false);
    if (!four.ok) expect(four.error).toMatch(/priorities/);
    expect(parseCoaching(JSON.stringify({ ...DEMO_COACHING, priorities: [] })).ok).toBe(false);
  });

  it("rejects missing sections and wrong types", () => {
    const { soundFixes: _omit, ...rest } = DEMO_COACHING;
    void _omit;
    const missing = parseCoaching(JSON.stringify(rest));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/soundFixes/);
    expect(parseCoaching(JSON.stringify({ ...DEMO_COACHING, pacingNotes: "slow down" })).ok).toBe(false);
  });

  it("rejects a sound fix with no example words, drill or minimal pair", () => {
    const fix = DEMO_COACHING.soundFixes[0]!;
    const bad = (patch: object) => parseCoaching(JSON.stringify({ ...DEMO_COACHING, soundFixes: [{ ...fix, ...patch }] })).ok;
    expect(bad({ exampleWords: [] })).toBe(false);
    expect(bad({ drill: "  " })).toBe(false);
    expect(bad({ minimalPair: { target: "very" } })).toBe(false);
  });

  it("allows empty optional lists", () => {
    expect(parseCoaching(JSON.stringify({ ...DEMO_COACHING, soundFixes: [], rewordings: [], intonationNotes: [] })).ok).toBe(true);
  });

  it("validates scenario and drill replies", () => {
    expect(parseModelJson('{"title":"Push back","tag":"difficult conversation","script":"I hear you."}', ScenarioSchema).ok).toBe(true);
    expect(parseModelJson('{"title":"Push back","tag":"email","script":"I hear you."}', ScenarioSchema).ok).toBe(false);
    expect(parseModelJson('{"title":"Drill","script":""}', DrillSchema).ok).toBe(false);
  });
});

describe("the demo coaching fixture is grounded in the demo script", () => {
  const scriptWords = new Set(normalizeWords(DEMO_SCRIPT.text));
  it("uses only example words from the script", () => {
    for (const fix of DEMO_COACHING.soundFixes) {
      for (const w of fix.exampleWords) expect(scriptWords.has(w.toLowerCase())).toBe(true);
    }
  });
  it("ties notes to real sentences", () => {
    const sentences = buildDemoResult().sentences;
    for (const n of [...DEMO_COACHING.pacingNotes, ...DEMO_COACHING.intonationNotes]) {
      expect(sentences.some((s) => n.sentence.includes(s))).toBe(true);
    }
  });
});

describe("buildCoachSummary", () => {
  const result = buildDemoResult();
  const summary = buildCoachSummary(result, aggregateWeakSounds(buildDemoSessions()));

  it("passes its own request schema and stays compact", () => {
    expect(CoachSummarySchema.safeParse(summary).success).toBe(true);
    expect(CoachRequestSchema.safeParse({ task: "coach", summary }).success).toBe(true);
    const size = JSON.stringify(summary).length;
    expect(size).toBeLessThan(6000);
    expect(size).toBeLessThan(JSON.stringify(result).length / 5);
  });

  it("does not carry raw Azure fields", () => {
    const json = JSON.stringify(summary);
    for (const key of ["NBest", "PronunciationAssessment", "Offset", "Syllables", "alternatives"]) {
      expect(json).not.toContain(key);
    }
  });

  it("lists the lowest words with expected versus heard phonemes", () => {
    expect(summary.lowWords.length).toBeLessThanOrEqual(10);
    expect(summary.lowWords[0]!.score).toBeLessThanOrEqual(summary.lowWords[1]!.score);
    const think = summary.lowWords.find((w) => w.word === "think");
    expect(think?.phonemes[0]).toEqual({ expected: "θ", score: 27, heard: "t" });
    expect(think?.sentence).toBe(4);
  });

  it("aggregates weak phonemes with what they were heard as", () => {
    const v = summary.weakPhonemes.find((p) => p.sound === "v");
    expect(v?.heardAs).toBe("b");
    expect(v?.words).toContain("very");
    expect(summary.weakPhonemes.find((p) => p.sound === "θ")?.heardAs).toBe("t");
  });

  it("includes miscues, pauses in context, intonation flags and history", () => {
    expect(summary.miscues.omitted).toEqual([{ word: "overall", sentence: 3 }]);
    expect(summary.miscues.inserted.map((i) => i.word)).toEqual(["the", "to"]);
    expect(summary.pacing.longPauses).toContainEqual({ ms: 1250, after: "need", before: "three", sentence: 4, midSentence: true });
    expect(summary.intonation.monotoneSentences).toEqual([3]);
    expect(summary.intonation.unexpectedBreaksBefore).toContain("three");
    expect(summary.recurringWeakSounds.length).toBeGreaterThan(0);
    expect(summary.sentences).toHaveLength(4);
  });

  it("carries no scores in transcript-only mode", () => {
    const t = buildTranscriptResult("good morning everyone", 3000, {
      id: "t", createdAt: "2026-01-01T00:00:00Z", scriptId: "s", scriptTitle: "t", referenceText: DEMO_SCRIPT.text,
    });
    const s = buildCoachSummary(t, []);
    expect(s.scores).toBeNull();
    expect(s.lowWords).toEqual([]);
    expect(s.weakPhonemes).toEqual([]);
    expect(s.pacing.longPauses).toBeNull();
    expect(CoachSummarySchema.safeParse(s).success).toBe(true);
  });
});

describe("coach request validation", () => {
  it("rejects unknown tasks and bad input", () => {
    expect(CoachRequestSchema.safeParse({ task: "nope" }).success).toBe(false);
    expect(CoachRequestSchema.safeParse({ task: "scenario", prompt: "" }).success).toBe(false);
    expect(CoachRequestSchema.safeParse({ task: "coach", summary: { raw: "azure json" } }).success).toBe(false);
    expect(CoachRequestSchema.safeParse({ task: "drill", phoneme: "v" }).success).toBe(true);
  });
});
