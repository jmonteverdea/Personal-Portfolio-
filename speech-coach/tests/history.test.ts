import { describe, expect, it } from "vitest";
import {
  aggregateWeakSounds, buildExport, mergeById, parseImport, phonemeStatsFor, summarizeSession,
} from "@/lib/history";
import { buildDemoResult, buildDemoSessions } from "@/lib/fixtures/demo";
import type { PhonemeStat, SessionRecord } from "@/lib/types";

const stat = (count: number, avg: number, lowCount = 0, examples: string[] = []): PhonemeStat => ({
  count, sum: count * avg, lowCount, examples,
});
const session = (id: string, date: string, phonemeStats: Record<string, PhonemeStat>): SessionRecord => ({
  id, date, scriptId: "s", scriptTitle: "Script", source: "azure", scores: null,
  wordsPerMinute: null, longPauseCount: null, phonemeStats,
});

describe("phonemeStatsFor", () => {
  const stats = phonemeStatsFor(buildDemoResult());
  it("counts every scored phoneme of the words I said", () => {
    expect(stats["v"]?.count).toBe(7); // everyone, give, very, vendor, review, positive, move
    expect(stats["θ"]?.count).toBe(2);
    expect(stats["θ"]?.lowCount).toBe(2);
    expect(stats["θ"]?.sum).toBe(27 + 33);
  });
  it("keeps the lowest-scoring example words", () => {
    expect(stats["v"]?.examples[0]).toBe("very");
    expect(stats["v"]?.examples).toHaveLength(3);
    expect(stats["θ"]?.examples).toEqual(["think", "three"]);
  });
  it("excludes inserted words", () => {
    // "the" is said 5 times, one of them an insertion; "this" adds one more /ð/
    expect(stats["ð"]?.count).toBe(5);
  });
});

describe("summarizeSession", () => {
  it("stores scores, date, script id and per-phoneme stats", () => {
    const result = buildDemoResult();
    const rec = summarizeSession(result);
    expect(rec).toMatchObject({
      id: result.id, date: result.createdAt, scriptId: result.scriptId, scores: result.scores,
      wordsPerMinute: result.pacing.wordsPerMinute, longPauseCount: 2,
    });
    expect(Object.keys(rec.phonemeStats).length).toBeGreaterThan(20);
  });
});

describe("aggregateWeakSounds", () => {
  const sessions = [
    session("a", "2026-01-01T00:00:00Z", { v: stat(4, 40, 4, ["very"]), i: stat(10, 95), θ: stat(2, 70, 0, ["think"]) }),
    session("b", "2026-01-02T00:00:00Z", { v: stat(6, 60, 3, ["vendor", "very"]), i: stat(10, 85), ʒ: stat(1, 10, 1, ["usual"]) }),
    session("c", "2026-01-03T00:00:00Z", { v: stat(10, 90, 0, ["move"]), θ: stat(2, 50, 2, ["three"]) }),
  ];
  const ranked = aggregateWeakSounds(sessions);

  it("ranks weakest first using occurrence-weighted averages across sessions", () => {
    expect(ranked.map((s) => s.phoneme)).toEqual(["θ", "v", "i"]);
    const v = ranked.find((s) => s.phoneme === "v")!;
    expect(v.averageAccuracy).toBe(71); // (160 + 360 + 900) / 20, not the mean of 40, 60, 90
    expect(v.occurrences).toBe(20);
    expect(v.lowCount).toBe(7);
  });

  it("counts sessions and the sessions where the sound was weak", () => {
    const v = ranked.find((s) => s.phoneme === "v")!;
    expect(v.sessions).toBe(3);
    expect(v.weakSessions).toBe(2);
    expect(ranked.find((s) => s.phoneme === "θ")).toMatchObject({ sessions: 2, weakSessions: 2, averageAccuracy: 60 });
  });

  it("drops sounds with too little evidence", () => {
    expect(ranked.find((s) => s.phoneme === "ʒ")).toBeUndefined();
    expect(aggregateWeakSounds(sessions, 1).find((s) => s.phoneme === "ʒ")).toBeDefined();
  });

  it("collects example words, most recent session first, without duplicates", () => {
    expect(ranked.find((s) => s.phoneme === "v")?.examples).toEqual(["move", "vendor", "very"]);
  });

  it("handles no history", () => {
    expect(aggregateWeakSounds([])).toEqual([]);
  });

  it("puts the planted problem sounds on top for the demo history", () => {
    const top = aggregateWeakSounds(buildDemoSessions()).slice(0, 6).map((s) => s.phoneme);
    expect(top).toContain("θ");
    expect(top).toContain("v");
    expect(top).toContain("ð");
  });
});

describe("export and import", () => {
  const sessions = buildDemoSessions();
  it("round-trips", () => {
    const json = JSON.stringify(buildExport(sessions, [], new Date("2026-11-10T00:00:00Z")));
    const back = parseImport(json);
    expect(back.sessions).toEqual(sessions);
    expect(back.exportedAt).toBe("2026-11-10T00:00:00.000Z");
  });
  it("rejects files that are not ours", () => {
    expect(() => parseImport("nope")).toThrow(/not valid JSON/);
    expect(() => parseImport('{"sessions":[]}')).toThrow(/not a Speech Coach export/);
    expect(() => parseImport('{"app":"speech-coach","sessions":[{"id":1}]}')).toThrow(/malformed/);
  });
  it("merges by id without overwriting what is already there", () => {
    const merged = mergeById([{ id: "a", v: 1 }], [{ id: "a", v: 2 }, { id: "b", v: 3 }]);
    expect(merged).toEqual([{ id: "a", v: 1 }, { id: "b", v: 3 }]);
  });
});
