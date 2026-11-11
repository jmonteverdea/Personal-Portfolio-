import { describe, expect, it } from "vitest";
import { buildLocalCoaching } from "@/lib/coach/local";
import { CoachingSchema } from "@/lib/coach/schema";
import { buildCoachSummary } from "@/lib/coach/summary";
import { buildTranscriptResult } from "@/lib/azure/normalize";
import { aggregateWeakSounds } from "@/lib/history";
import { buildDemoResult, buildDemoSessions, DEMO_SCRIPT } from "@/lib/fixtures/demo";
import { matchScenarios, SCENARIOS } from "@/lib/scenarios";
import { normalizeWords } from "@/lib/text";

const result = buildDemoResult();
const summary = buildCoachSummary(result, aggregateWeakSounds(buildDemoSessions().slice(0, 3)));
const coaching = buildLocalCoaching(summary);

describe("built-in coach", () => {
  it("returns the same validated shape Claude does", () => {
    expect(CoachingSchema.safeParse(coaching).success).toBe(true);
    expect(coaching.priorities.length).toBeGreaterThanOrEqual(1);
    expect(coaching.priorities.length).toBeLessThanOrEqual(3);
    expect(coaching.rewordings).toEqual([]);
  });

  it("is deterministic", () => {
    expect(buildLocalCoaching(summary)).toEqual(coaching);
  });

  it("leads with the weakest recurring sound and says what it was heard as", () => {
    expect(coaching.priorities[0]?.title).toBe("Fix /θ/: you are saying /t/");
    expect(coaching.priorities[0]?.detail).toMatch(/"think" and "three"/);
    expect(coaching.priorities[0]?.detail).toMatch(/also weak in 3 earlier sessions/);
    expect(coaching.priorities.some((p) => p.title.includes("/v/"))).toBe(true);
  });

  it("gives a physical instruction, the Spanish habit and a matching minimal pair per sound", () => {
    const v = coaching.soundFixes.find((f) => f.sound === "/v/")!;
    expect(v.exampleWords).toContain("very");
    expect(v.instruction).toMatch(/top teeth/);
    expect(v.instruction).toMatch(/lips never touch/);
    expect(v.minimalPair).toEqual({ target: "very", contrast: "berry" });
    expect(v.drill).toMatch(/berry, very/);
    const th = coaching.soundFixes.find((f) => f.sound === "/θ/")!;
    expect(th.minimalPair).toEqual({ target: "three", contrast: "tree" });
    expect(coaching.soundFixes.length).toBeLessThanOrEqual(5);
  });

  it("only uses example words from the script", () => {
    const scriptWords = new Set(normalizeWords(DEMO_SCRIPT.text));
    for (const fix of coaching.soundFixes) for (const w of fix.exampleWords) expect(scriptWords.has(w.toLowerCase())).toBe(true);
  });

  it("ties pacing and intonation notes to real sentences and real numbers", () => {
    const all = [...coaching.pacingNotes, ...coaching.intonationNotes];
    for (const n of all) expect(result.sentences).toContain(n.sentence);
    expect(coaching.pacingNotes.some((n) => /1\.3 seconds pause between "need" and "three"/.test(n.note))).toBe(true);
    expect(coaching.pacingNotes.some((n) => /skipped "overall"/.test(n.note))).toBe(true);
    expect(coaching.pacingNotes.some((n) => /repeated "the" and "to"/.test(n.note))).toBe(true);
    expect(coaching.pacingNotes.some((n) => /138 words per minute/.test(n.note))).toBe(true);
    const flat = coaching.intonationNotes.find((n) => n.sentence.startsWith("We shipped"));
    expect(flat?.note).toMatch(/Stress .*(SHIPPED|FEEDBACK|POSITIVE)/);
    expect(flat?.note).toMatch(/fall on the last word/);
  });

  it("falls back to a generic instruction for a sound it has no guide for", () => {
    const odd = buildLocalCoaching({ ...summary, weakPhonemes: [{ sound: "ɬ", average: 40, count: 3, heardAs: "l", words: ["very"] }] });
    expect(odd.soundFixes[0]?.instruction).toMatch(/copy it slowly/);
    expect(CoachingSchema.safeParse(odd).success).toBe(true);
  });

  it("coaches a transcript-only take without inventing sound feedback", () => {
    const meta = { id: "t", createdAt: "2026-01-01T00:00:00Z", scriptId: "s", scriptTitle: "t", referenceText: DEMO_SCRIPT.text };
    const partial = buildLocalCoaching(buildCoachSummary(buildTranscriptResult("good morning everyone I want to give a quick update", 6000, meta), []));
    expect(partial.soundFixes).toEqual([]);
    expect(partial.priorities[0]?.title).toBe("Say every word of the script");
    expect(CoachingSchema.safeParse(partial).success).toBe(true);

    const clean = buildLocalCoaching(buildCoachSummary(buildTranscriptResult(DEMO_SCRIPT.text, 20000, meta), []));
    expect(clean.priorities).toHaveLength(1);
    expect(clean.priorities[0]?.title).toBe("Clean read");
    expect(CoachingSchema.safeParse(clean).success).toBe(true);
  });
});

describe("built-in scenarios", () => {
  it("finds a scenario by keywords", () => {
    expect(matchScenarios("push back on a deadline with a VP")[0]?.title).toBe("Pushing back on a deadline with a VP");
    expect(matchScenarios("ask for a raise")[0]?.title).toBe("Asking for a raise");
    expect(matchScenarios("presentation opening")[0]?.tag).toBe("presentation");
  });
  it("returns nothing for an unrelated prompt", () => {
    expect(matchScenarios("zzz qqq")).toEqual([]);
  });
  it("ships readable scripts with numbers written as words", () => {
    for (const s of SCENARIOS) {
      expect(normalizeWords(s.script).length).toBeGreaterThan(40);
      expect(/\d/.test(s.script)).toBe(false);
      expect(s.script).not.toContain("—");
    }
  });
});
