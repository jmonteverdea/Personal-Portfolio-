import { describe, expect, it } from "vitest";
import { scriptDelta, soundChanges, soundDelta } from "@/lib/learning/bests";
import { contentFor, sentencesFromScripts, stageMaterial, wordsWithSound } from "@/lib/learning/content";
import { buildEarRounds, checkEarAnswer, seededRandom, summarizeEar } from "@/lib/learning/ear";
import { MASTERY_NAMES, masteryLevel, nextStageHint } from "@/lib/learning/mastery";
import { buildObservations } from "@/lib/learning/observations";
import { nextScript, planSession } from "@/lib/learning/plan";
import { rankByRecurrence } from "@/lib/learning/priority";
import { weekRhythm } from "@/lib/learning/rhythm";
import { dueQueue, REVIEW_INTERVALS, reviewState } from "@/lib/learning/schedule";
import { exportableLearning, mergeLearning, parseLearningImport } from "@/lib/learning/transfer";
import { EMPTY_LEARNING, type DrillTake, type Observation, type PracticeContext } from "@/lib/learning/types";
import { simulateDrillTake, simulateRetryScores, simulateScriptTake } from "@/lib/fixtures/demo-learning";
import { buildDemoResult, buildDemoSessions, DEMO_SCRIPT } from "@/lib/fixtures/demo";
import { buildExport, parseImport, phonemeStatsFor, summarizeSession } from "@/lib/history";
import type { PhonemeStat, Script, SessionRecord } from "@/lib/types";

const day = (n: number, hour = 10): string => new Date(2026, 0, n, hour).toISOString();
const at = (n: number): Date => new Date(2026, 0, n, 12);
const obs = (n: number, average: number, context: PracticeContext = "script"): Observation => ({
  phoneme: "v", date: day(n), average, count: 4, context, scriptId: context === "script" ? "s1" : null,
});
const stat = (count: number, avg: number, examples: string[] = []): PhonemeStat => ({ count, sum: count * avg, lowCount: 0, examples });
const session = (id: string, n: number, scriptId: string, stats: Record<string, PhonemeStat>, overall: number | null = 70): SessionRecord => ({
  id, date: day(n), scriptId, scriptTitle: scriptId, source: "azure",
  scores: overall === null ? null : { overall, accuracy: overall, fluency: overall, completeness: 100, prosody: overall },
  wordsPerMinute: 140, longPauseCount: 0, phonemeStats: stats,
});

describe("review schedule", () => {
  it("does not schedule a sound that has never been weak", () => {
    expect(reviewState([obs(1, 92), obs(2, 88)], at(3))).toBeNull();
    expect(reviewState([], at(3))).toBeNull();
  });

  it("starts at one day when a sound is first weak", () => {
    const s = reviewState([obs(1, 55)], at(1))!;
    expect(s.intervalDays).toBe(1);
    expect(s.due).toBe(false);
    expect(reviewState([obs(1, 55)], at(2))!.due).toBe(true);
  });

  it("stretches 1, 3, 7, 14 days as good reviews land on time", () => {
    const history = [obs(1, 55)];
    const gaps: number[] = [];
    let date = 1;
    for (const interval of REVIEW_INTERVALS) {
      date += interval;
      history.push(obs(date, 90));
      gaps.push(reviewState(history, at(date))!.intervalDays);
    }
    expect(gaps).toEqual([3, 7, 14, 14]);
    const final = reviewState(history, at(date))!;
    expect(final.due).toBe(false);
    expect(final.dueInDays).toBe(14);
  });

  it("shrinks one step on a slip", () => {
    const stretched = [obs(1, 55), obs(2, 90), obs(5, 90)];
    expect(reviewState(stretched, at(5))!.intervalDays).toBe(7);
    const slipped = [...stretched, obs(12, 45)];
    const state = reviewState(slipped, at(12))!;
    expect(state.intervalDays).toBe(3);
    expect(state.dueInDays).toBe(3);
    expect(reviewState([...slipped, obs(13, 40)], at(13))!.intervalDays).toBe(1);
    expect(reviewState([...slipped, obs(13, 40), obs(14, 30)], at(14))!.intervalDays).toBe(1);
  });

  it("does not stretch when I cram: good reviews on the same day count once", () => {
    const crammed = [obs(1, 55), obs(2, 90), obs(2, 95), obs(2, 97)];
    expect(reviewState(crammed, at(2))!.intervalDays).toBe(3);
  });

  it("holds the gap on a fair review", () => {
    const state = reviewState([obs(1, 55), obs(2, 90), obs(5, 70)], at(5))!;
    expect(state.intervalDays).toBe(3);
    expect(state.dueInDays).toBe(3);
  });

  it("lists due sounds, most overdue first", () => {
    const byPhoneme = new Map<string, Observation[]>([
      ["v", [obs(1, 50)]],
      ["θ", [{ ...obs(4, 40), phoneme: "θ" }]],
      ["i", [{ ...obs(1, 95), phoneme: "i" }]],
      ["z", [{ ...obs(6, 60), phoneme: "z" }]],
    ]);
    expect(dueQueue(byPhoneme, at(6)).map((s) => s.phoneme)).toEqual(["v", "θ"]);
    expect(dueQueue(byPhoneme, at(7)).map((s) => s.phoneme)).toEqual(["v", "θ", "z"]);
  });
});

describe("mastery levels", () => {
  it("has four named stages above unmapped", () => {
    expect(Object.values(MASTERY_NAMES)).toEqual(["Unmapped", "Finding", "Shaping", "Holding", "Owned"]);
    expect(masteryLevel([])).toBe(0);
  });

  it("is Finding after one weak take and Shaping after one good take or two fair ones", () => {
    expect(masteryLevel([obs(1, 45)])).toBe(1);
    expect(masteryLevel([obs(1, 70)])).toBe(1);
    expect(masteryLevel([obs(1, 65), obs(2, 70)])).toBe(2);
    expect(masteryLevel([obs(1, 85)])).toBe(2);
  });

  it("needs good scores on two separate days to reach Holding", () => {
    expect(masteryLevel([obs(1, 85, "pairs"), { ...obs(1, 90, "pairs"), date: day(1, 15) }])).toBe(2);
    expect(masteryLevel([obs(1, 85, "pairs"), obs(3, 90, "mixed")])).toBe(3);
  });

  it("only reaches Owned when it holds in real sentences on two days", () => {
    const drillsOnly = [obs(1, 90, "pairs"), obs(3, 92, "mixed"), obs(6, 95, "pairs")];
    expect(masteryLevel(drillsOnly)).toBe(3);
    expect(masteryLevel([...drillsOnly, obs(7, 88, "sentences")])).toBe(3);
    expect(masteryLevel([...drillsOnly, obs(7, 88, "sentences"), obs(9, 91, "script")])).toBe(4);
  });

  it("is not Owned if the latest real-sentence take was not good, even with good drills after", () => {
    const history = [obs(1, 90, "script"), obs(3, 91, "script"), obs(5, 70, "script"), obs(6, 95, "pairs")];
    expect(masteryLevel(history)).toBe(3);
  });

  it("drops one stage per slip, never below Finding", () => {
    const owned = [obs(1, 90), obs(3, 92), obs(6, 95)];
    expect(masteryLevel(owned)).toBe(4);
    expect(masteryLevel([...owned, obs(8, 50)])).toBe(3);
    expect(masteryLevel([...owned, obs(8, 50), obs(9, 40)])).toBe(2);
    expect(masteryLevel([...owned, obs(8, 50), obs(9, 40), obs(10, 30), obs(11, 20)])).toBe(1);
  });

  it("can be earned back after a slip", () => {
    const recovered = [obs(1, 90), obs(3, 92), obs(8, 50), obs(9, 88), obs(11, 90)];
    expect(masteryLevel(recovered)).toBe(4);
  });

  it("says what the next stage needs", () => {
    expect(nextStageHint([obs(1, 40)])).toMatch(/60 or more/);
    expect(nextStageHint([obs(1, 90), obs(3, 92, "pairs")])).toMatch(/real sentences/);
    expect(nextStageHint([obs(1, 90), obs(3, 92)])).toBeNull();
  });
});

describe("weak-sound ranking by recurrence", () => {
  const sessions = [
    session("a", 1, "s1", { θ: stat(2, 20), v: stat(4, 70), z: stat(3, 75), i: stat(9, 95) }),
    session("b", 2, "s2", { v: stat(4, 72), z: stat(3, 78), i: stat(9, 96) }),
    session("c", 3, "s1", { v: stat(4, 74), z: stat(3, 85), θ: stat(2, 90) }),
  ];
  const ranked = rankByRecurrence(sessions);

  it("puts the sound that keeps coming back first, not the single lowest score", () => {
    expect(ranked.map((r) => r.phoneme)).toEqual(["v", "z", "θ"]);
    expect(ranked[0]).toMatchObject({ weakSessions: 3, sessions: 3, weakScripts: 2, weakLatest: true });
    expect(ranked[2]).toMatchObject({ phoneme: "θ", weakSessions: 1, weakLatest: false });
  });

  it("breaks ties by number of scripts, then by whether it is still weak", () => {
    const tied = rankByRecurrence([
      session("a", 1, "s1", { v: stat(2, 70), z: stat(2, 70) }),
      session("b", 2, "s2", { v: stat(2, 70) }),
      session("c", 3, "s1", { z: stat(2, 70) }),
    ]);
    expect(tied.map((r) => r.phoneme)).toEqual(["v", "z"]);
  });

  it("leaves out sounds that were never weak, and handles no history", () => {
    expect(ranked.find((r) => r.phoneme === "i")).toBeUndefined();
    expect(rankByRecurrence([])).toEqual([]);
  });
});

describe("personal-best deltas", () => {
  const sessions = [
    session("a", 1, "s1", { v: stat(4, 50), θ: stat(2, 60) }, 62),
    session("b", 2, "s2", { v: stat(4, 90) }, 95),
    session("c", 3, "s1", { v: stat(4, 66), θ: stat(2, 58) }, 71),
    session("d", 4, "s1", { v: stat(4, 80), θ: stat(2, 40) }, 68),
    session("e", 5, "s1", {}, null),
  ];

  it("compares a take with the last take of the same script", () => {
    expect(scriptDelta(sessions, "c")).toEqual({ current: 71, previous: 62, delta: 9, bestBefore: 62, isBest: true });
    expect(scriptDelta(sessions, "d")).toEqual({ current: 68, previous: 71, delta: -3, bestBefore: 71, isBest: false });
  });

  it("has no delta and no best on a first take, and none for unscored takes", () => {
    expect(scriptDelta(sessions, "a")).toEqual({ current: 62, previous: null, delta: null, bestBefore: null, isBest: false });
    expect(scriptDelta(sessions, "e")).toBeNull();
    expect(scriptDelta(sessions, "missing")).toBeNull();
  });

  it("gives a per-sound delta against the last observation", () => {
    expect(soundDelta([obs(1, 50), obs(2, 72.4)])).toMatchObject({ current: 72.4, previous: 50, delta: 22.4, isBest: true });
    expect(soundDelta([obs(1, 80), obs(2, 70)])).toMatchObject({ delta: -10, isBest: false, bestBefore: 80 });
    expect(soundDelta([])).toBeNull();
  });

  it("lists what improved and what slipped since the last take, ignoring noise", () => {
    const { improved, slipped } = soundChanges(sessions, "d");
    expect(improved).toEqual([{ phoneme: "v", before: 66, after: 80, delta: 14 }]);
    expect(slipped).toEqual([{ phoneme: "θ", before: 58, after: 40, delta: -18 }]);
    // Compared with the last take that had the sound, whatever script it was. θ moved 2 points: noise.
    expect(soundChanges(sessions, "c").slipped).toEqual([{ phoneme: "v", before: 90, after: 66, delta: -24 }]);
    expect(soundChanges(sessions, "c").improved).toEqual([]);
    expect(soundChanges(sessions, "a")).toEqual({ improved: [], slipped: [] });
  });
});

describe("ear training", () => {
  const rounds = buildEarRounds("v", 3, 8, seededRandom(7));

  it("builds rounds from the sound's minimal pairs", () => {
    expect(rounds).toHaveLength(8);
    for (const r of rounds) {
      expect([r.pair.target, r.pair.contrast]).toContain(r.spoken);
      expect([...r.options].sort()).toEqual([r.pair.target, r.pair.contrast].sort());
      expect(r.voice).toBeGreaterThanOrEqual(0);
      expect(r.voice).toBeLessThan(3);
    }
    expect(new Set(rounds.map((r) => r.pair.target)).size).toBe(4);
  });

  it("keeps the options in a fixed order so position is not a clue", () => {
    const veryRounds = buildEarRounds("v", 2, 40, seededRandom(3)).filter((r) => r.pair.target === "very");
    expect(new Set(veryRounds.map((r) => r.options.join("|")))).toEqual(new Set(["berry|very"]));
    expect(new Set(veryRounds.map((r) => r.spoken)).size).toBe(2);
  });

  it("never uses the same voice twice in a row when there is more than one", () => {
    const many = buildEarRounds("θ", 3, 30, seededRandom(11));
    for (let i = 1; i < many.length; i++) expect(many[i]!.voice).not.toBe(many[i - 1]!.voice);
    expect(new Set(buildEarRounds("θ", 1, 5, seededRandom(1)).map((r) => r.voice))).toEqual(new Set([0]));
  });

  it("is deterministic for a seed and empty for a sound with no pairs", () => {
    expect(buildEarRounds("v", 3, 8, seededRandom(7))).toEqual(rounds);
    expect(buildEarRounds("ʒ", 3, 8, seededRandom(7))).toEqual([]);
  });

  it("checks an answer against the word that was played", () => {
    const round = rounds[0]!;
    const wrong = round.options.find((o) => o !== round.spoken)!;
    expect(checkEarAnswer(round, round.spoken)).toBe(true);
    expect(checkEarAnswer(round, `  ${round.spoken.toUpperCase()} `)).toBe(true);
    expect(checkEarAnswer(round, wrong)).toBe(false);
    expect(checkEarAnswer(round, "")).toBe(false);
  });

  it("summarizes a drill and names the pairs I missed", () => {
    const answers = rounds.map((r, i) => (i < 6 ? r.spoken : r.options.find((o) => o !== r.spoken)!));
    const summary = summarizeEar(rounds, answers);
    expect(summary).toMatchObject({ rounds: 8, correct: 6, accuracy: 0.75 });
    expect(summary.missed.length).toBeGreaterThan(0);
    expect(summarizeEar(rounds, rounds.map(() => null))).toMatchObject({ rounds: 0, correct: 0, accuracy: 0 });
  });
});

describe("observations", () => {
  const drill: DrillTake = { id: "d1", date: day(4), phoneme: "v", stage: "pairs", source: "azure", text: "berry, very.", phonemeStats: { v: stat(3, 82), b: stat(3, 99) } };
  const sessions = [session("a", 1, "s1", { v: stat(4, 50) }), session("b", 2, "drill-script", { v: stat(4, 70) })];
  const byPhoneme = buildObservations(sessions, [drill], new Set(["drill-script"]));

  it("joins script takes and drill takes, oldest first, with their context", () => {
    expect(byPhoneme.get("v")?.map((o) => [o.context, o.average])).toEqual([["script", 50], ["mixed", 70], ["pairs", 82]]);
  });
  it("only credits a drill for the sound it targets", () => {
    expect(byPhoneme.has("b")).toBe(false);
  });
});

describe("drill material", () => {
  const scripts: Script[] = [
    { ...DEMO_SCRIPT },
    { id: "x", title: "Drill", text: "Very very very vendor.", tags: ["drill"], createdAt: "", updatedAt: "" },
  ];
  const results = [buildDemoResult()];

  it("goes narrow, then mixed, then real sentences", () => {
    const pairs = stageMaterial("v", "pairs");
    expect(pairs.text).toBe("berry, very. ban, van. best, vest.");
    expect(pairs.modelParts).toEqual(["berry", "very", "ban", "van", "best", "vest"]);
    expect(stageMaterial("v", "mixed").text).toMatch(/^value, market, seven/);
  });

  it("takes the sentence stage from my own scripts, never from drill scripts", () => {
    const material = stageMaterial("v", "sentences", { scripts, results });
    expect(material.fromMyScripts).toBe(true);
    expect(material.text).toContain("I want to give a very quick update on the vendor review.");
    expect(material.text).not.toContain("Very very very");
  });

  it("falls back to built-in material, then to my missed words", () => {
    expect(stageMaterial("v", "sentences").fromMyScripts).toBe(false);
    expect(stageMaterial("v", "sentences").text).toBe(contentFor("v")!.sentence);
    expect(stageMaterial("ʒ", "pairs", { examples: ["usual", "measure"] }).text).toBe("usual. measure. usual. measure.");
  });

  it("finds words with a sound from my results and ranks sentences by how many they hold", () => {
    const known = wordsWithSound("θ", results);
    expect(known.has("think")).toBe(true);
    expect(known.has("three")).toBe(true);
    expect(sentencesFromScripts(scripts, known, 1)[0]).toMatch(/^I think we need three more weeks/);
  });
});

describe("guided session plan", () => {
  const scripts: Script[] = [
    { id: "s1", title: "Status", text: "a", tags: ["meeting"], createdAt: "2026-01-01", updatedAt: "" },
    { id: "s2", title: "Pitch", text: "b", tags: ["presentation"], createdAt: "2026-01-02", updatedAt: "" },
    { id: "d", title: "Drill", text: "c", tags: ["drill"], createdAt: "2026-01-03", updatedAt: "" },
  ];
  const sessions = [session("a", 1, "s1", { v: stat(4, 50), θ: stat(2, 30), z: stat(2, 70) }), session("b", 2, "s1", { v: stat(4, 55), z: stat(2, 72) })];
  const priorities = rankByRecurrence(sessions);
  const due = dueQueue(buildObservations(sessions, []), at(5));

  it("puts due sounds first, by recurrence, then an ear drill, then one work script", () => {
    const plan = planSession({ due, priorities, scripts, sessions });
    expect(plan).toEqual([
      { kind: "review", phoneme: "v" },
      { kind: "review", phoneme: "z" },
      { kind: "ear", phoneme: "v" },
      { kind: "script", scriptId: "s2" },
    ]);
  });

  it("starts a new user with a single baseline take", () => {
    expect(planSession({ due: [], priorities: [], scripts, sessions: [] })).toEqual([{ kind: "script", scriptId: "s1" }]);
  });

  it("picks the work script practised least recently and never a drill", () => {
    expect(nextScript(scripts, sessions)?.id).toBe("s2");
    expect(nextScript(scripts, [...sessions, session("c", 3, "s2", {})])?.id).toBe("s1");
    expect(nextScript([scripts[2]!], [])).toBeNull();
  });
});

describe("weekly rhythm", () => {
  const wednesday = new Date(2026, 0, 7, 12);
  it("marks the days practised this week, Monday to Sunday", () => {
    const week = weekRhythm([day(5), day(7), day(7, 18), day(1)], 4, wednesday);
    expect(week.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week.days.map((d) => d.practised)).toEqual([true, false, true, false, false, false, false]);
    expect(week.days.find((d) => d.today)?.label).toBe("Wed");
    expect(week.days.filter((d) => d.future).map((d) => d.label)).toEqual(["Thu", "Fri", "Sat", "Sun"]);
    expect(week).toMatchObject({ practised: 2, target: 4, met: false });
  });
  it("clamps the target and reports when it is met", () => {
    expect(weekRhythm([day(5), day(6)], 2, wednesday).met).toBe(true);
    expect(weekRhythm([], 0, wednesday).target).toBe(1);
    expect(weekRhythm([], 12, wednesday).target).toBe(7);
  });
});

describe("demo simulation", () => {
  it("simulates a drill take through the real normalizer, better at each stage", () => {
    const targets = new Set(["very", "van", "vest"]);
    const now = new Date(2026, 0, 5);
    const pairs = simulateDrillTake("berry, very. ban, van. best, vest.", "v", "pairs", targets, "t1", now);
    expect(pairs.source).toBe("demo");
    expect(pairs.words.every((w) => w.status === "correct" || w.status === "mispronounced")).toBe(true);
    const avg = (stage: "pairs" | "mixed" | "sentences") => {
      const s = phonemeStatsFor(simulateDrillTake("berry, very. ban, van. best, vest.", "v", stage, targets, "t", now)).v!;
      return s.sum / s.count;
    };
    expect(avg("pairs")).toBeLessThan(avg("mixed"));
    expect(avg("mixed")).toBeLessThan(avg("sentences"));
    expect(phonemeStatsFor(pairs).v?.count).toBe(3);
  });

  it("simulates a better take of the sample script and a better retry", () => {
    const before = buildDemoResult();
    const after = simulateScriptTake("t2", new Date(2026, 10, 12));
    expect(after.scores!.overall).toBeGreaterThan(before.scores!.overall);
    expect(after.words).toHaveLength(before.words.length);
    const retried = simulateRetryScores(before.words.slice(0, 10));
    before.words.slice(0, 10).forEach((w, i) => {
      if (w.accuracy !== null && w.accuracy < 80) expect(retried[i]!).toBeGreaterThan(w.accuracy);
    });
  });

  it("makes the demo history produce due sounds and a spread of mastery levels", () => {
    const sessions = buildDemoSessions();
    const byPhoneme = buildObservations(sessions, []);
    const due = dueQueue(byPhoneme, new Date(2026, 10, 11)).map((s) => s.phoneme);
    expect(due).toContain("θ");
    expect(due).toContain("v");
    const levels = new Set([...byPhoneme.values()].map(masteryLevel));
    expect(levels.size).toBeGreaterThanOrEqual(3);
    expect(rankByRecurrence(sessions)[0]?.weakSessions).toBe(4);
  });
});

describe("learning export and import", () => {
  const data = {
    ...EMPTY_LEARNING,
    weeklyTarget: 5,
    drillTakes: [
      { id: "d1", date: day(1), phoneme: "v", stage: "pairs" as const, source: "azure" as const, text: "x", phonemeStats: {} },
      { id: "d2", date: day(1), phoneme: "v", stage: "pairs" as const, source: "demo" as const, text: "x", phonemeStats: {} },
    ],
  };

  it("still reads an old export file that has no learning block", () => {
    const oldFile = JSON.stringify(buildExport([summarizeSession(buildDemoResult())], [], new Date(2026, 0, 1)));
    expect(parseImport(oldFile).sessions).toHaveLength(1);
    expect(parseLearningImport(oldFile)).toBeNull();
  });

  it("round-trips my own learning data next to the history, without demo data", () => {
    const file = JSON.stringify({ ...buildExport([], [], new Date(2026, 0, 1)), learning: exportableLearning(data) });
    expect(parseImport(file).sessions).toEqual([]);
    const back = parseLearningImport(file)!;
    expect(back.drillTakes.map((t) => t.id)).toEqual(["d1"]);
    expect(back.weeklyTarget).toBe(5);
  });

  it("merges by id and survives garbage", () => {
    const merged = mergeLearning(data, { ...EMPTY_LEARNING, drillTakes: [{ ...data.drillTakes[0]!, text: "changed" }, { ...data.drillTakes[0]!, id: "d3" }] });
    expect(merged.drillTakes.map((t) => [t.id, t.text])).toEqual([["d1", "x"], ["d2", "x"], ["d3", "x"]]);
    expect(parseLearningImport("not json")).toBeNull();
    expect(parseLearningImport('{"learning":{"drillTakes":[{"nope":1}],"weeklyTarget":99}}')).toMatchObject({ drillTakes: [], weeklyTarget: 7 });
  });
});
