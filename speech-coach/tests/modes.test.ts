import { describe, expect, it } from "vitest";
import { DEMO_ANSWERS, DEMO_FREE_TALK, demoContours, demoEarlierScan, demoScanRecord, demoTurn } from "@/lib/fixtures/demo-modes";
import { CONSONANTS, VOWELS } from "@/lib/learning/map";
import { analyzeDelivery, RAMBLING_WORDS, tightenByRules } from "@/lib/modes/delivery";
import { activeEvent, buildEventPlan, hardSentencesIn, MAX_PLAN_DAYS, PACE_TARGET, riskyWordsIn } from "@/lib/modes/event";
import { alignTime, stressGaps, chunkSentence, compareContours, extractPitch, medianHz, pitchPerWord, pitchRange, smoothContour, toSemitones, type Contour } from "@/lib/modes/pitch";
import { CLARITY_NAMES, CLEAR, compareScans, daysUntilRetake, mergeStats, SCAN_PARTS, SCAN_TARGETS, summarizeScan } from "@/lib/modes/scan";
import { customScenario, pickCorrection, SCENARIOS, scriptedReply, turnFromOutcome } from "@/lib/modes/talk";
import { exportableModes, mergeModes, parseModesImport } from "@/lib/modes/transfer";
import { applyOverrides, contributionsOf, explainLowWord, isClear, latestVotes, MAX_TRIES, noteKey, recentDislikes, shouldFlag, triesLeft, tryState } from "@/lib/modes/trust";
import { EMPTY_MODES, type Override, type SavedWord, type TalkTurn, type Thumb } from "@/lib/modes/types";
import { addWords, carrierLine, cleanEntry, dueWords, isSaved, parseBulk, savedWordsWithSound, wordReview } from "@/lib/modes/words";
import { demoSegments } from "@/lib/fixtures/demo";
import { buildExport, parseImport } from "@/lib/history";
import { normalizeWords } from "@/lib/text";
import type { PhonemeStat } from "@/lib/types";

const stat = (count: number, avg: number, examples: string[] = []): PhonemeStat => ({ count, sum: count * avg, lowCount: avg < 60 ? count : 0, examples });
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

/* ---------- 1. baseline scan ---------- */

describe("baseline scan: phoneme coverage", () => {
  const scanWords = new Set(SCAN_PARTS.flatMap((p) => normalizeWords(p.text)));
  const inventory = [...CONSONANTS.map((c) => c.phoneme), ...VOWELS.map((v) => v.phoneme)];

  it("covers every English sound on the Sound Map", () => {
    for (const phoneme of inventory) expect(SCAN_TARGETS[phoneme], `missing target for ${phoneme}`).toBeDefined();
    expect(Object.keys(SCAN_TARGETS).length).toBe(inventory.length);
  });

  it("only lists words that are really in the passage", () => {
    for (const [phoneme, target] of Object.entries(SCAN_TARGETS)) {
      for (const [word] of target.words) expect(scanWords.has(word), `${word} (for ${phoneme}) is not in the scan text`).toBe(true);
    }
  });

  it("puts every sound in at least two words, and every consonant in more than one position where English allows it", () => {
    const oneSided = new Set(["h", "w", "j", "ð", "ʒ"]); // these do not end English words (or, for ʒ, rarely start them)
    for (const [phoneme, target] of Object.entries(SCAN_TARGETS)) {
      expect(target.words.length, phoneme).toBeGreaterThanOrEqual(2);
      const isConsonant = CONSONANTS.some((c) => c.phoneme === phoneme);
      if (isConsonant && !oneSided.has(phoneme)) expect(new Set(target.words.map(([, pos]) => pos)).size, phoneme).toBeGreaterThanOrEqual(2);
    }
  });

  it("weights the Spanish-speaker contrasts, and gives them more words", () => {
    for (const phoneme of ["v", "θ", "ð", "ɪ", "z", "ʃ", "dʒ"]) {
      expect(SCAN_TARGETS[phoneme]!.weight).toBe(3);
      expect(SCAN_TARGETS[phoneme]!.words.length).toBeGreaterThanOrEqual(4);
    }
    // both halves of each merged pair are present
    for (const [a, b] of [["v", "b"], ["ɪ", "i"], ["z", "s"], ["ʃ", "tʃ"], ["θ", "t"], ["dʒ", "j"]] as const) {
      expect(SCAN_TARGETS[a]).toBeDefined();
      expect(SCAN_TARGETS[b]).toBeDefined();
    }
    // final consonants are tested in final position
    for (const phoneme of ["t", "d", "k", "z", "v"]) expect(SCAN_TARGETS[phoneme]!.words.some(([, pos]) => pos === "end")).toBe(true);
  });

  it("has a word-stress part and stays a five-minute read", () => {
    expect(SCAN_PARTS.some((p) => /record a record/.test(p.text) && /present the present/.test(p.text))).toBe(true);
    const words = SCAN_PARTS.reduce((n, p) => n + normalizeWords(p.text).length, 0);
    expect(words).toBeGreaterThan(110);
    expect(words).toBeLessThan(220);
  });
});

describe("baseline scan: result and focus-sound ranking", () => {
  const stats = { v: stat(6, 50), θ: stat(4, 60), s: stat(5, 40), i: stat(8, 92), m: stat(4, 97), ɪ: stat(6, 78), w: stat(3, 81) };
  const summary = summarizeScan(stats);

  it("splits sounds into clear and focus at the clear threshold", () => {
    expect(CLEAR).toBe(80);
    expect(summary.clear.map((s) => s.phoneme)).toEqual(["m", "i", "w"]);
    expect(summary.focus.map((s) => s.phoneme).sort()).toEqual(["s", "v", "ɪ", "θ"].sort());
  });

  it("ranks focus sounds by how far under clear they are, times how much the sound matters", () => {
    // v: (80-50)*3 = 90, θ: 20*3 = 60, s: 40*1 = 40, ɪ: 2*3 = 6
    expect(summary.focus.map((s) => [s.phoneme, s.priority])).toEqual([["v", 90], ["θ", 60], ["s", 40], ["ɪ", 6]]);
    // the single lowest score is not first
    expect(summary.focus[0]!.average).toBeGreaterThan(summary.focus[2]!.average);
  });

  it("names a clarity level from the share of clear sounds", () => {
    expect(summary.level).toBe(1);
    expect(summarizeScan({ a: stat(2, 90), b: stat(2, 85), c: stat(2, 70), d: stat(2, 95) }).level).toBe(3);
    expect(summarizeScan({ a: stat(2, 90), b: stat(2, 85), c: stat(2, 82) }).level).toBe(4);
    expect(summarizeScan({ a: stat(2, 90), b: stat(2, 70) }).level).toBe(2);
    expect(summarizeScan({}).level).toBe(1);
    expect(Object.values(CLARITY_NAMES)).toHaveLength(4);
  });

  it("never treats a poor sound as part of the top level", () => {
    const stats10 = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, stat(2, i === 0 ? 40 : 95)]));
    expect(summarizeScan(stats10).clearShare).toBe(0.9);
    expect(summarizeScan(stats10).level).toBe(3);
  });

  it("merges parts and compares a retake with the scan before it", () => {
    expect(mergeStats([{ v: stat(2, 50, ["very"]) }, { v: stat(2, 70, ["van"]), θ: stat(1, 90) }]).v).toMatchObject({ count: 4, sum: 240, examples: ["very", "van"] });
    const before = { ...demoEarlierScan(), stats: { v: stat(4, 50), θ: stat(4, 76), i: stat(4, 90), z: stat(4, 70) } };
    const after = { ...before, id: "b", stats: { v: stat(4, 71), θ: stat(4, 84), i: stat(4, 91), z: stat(4, 62) } };
    const change = compareScans(before, after);
    expect(change.improved).toEqual([{ phoneme: "v", before: 50, after: 71, delta: 21 }, { phoneme: "θ", before: 76, after: 84, delta: 8 }]);
    expect(change.slipped).toEqual([{ phoneme: "z", before: 70, after: 62, delta: -8 }]);
    expect(change.nowClear).toEqual(["θ"]);
    expect(change.levelAfter).toBeGreaterThanOrEqual(change.levelBefore);
  });

  it("suggests a retake after a month", () => {
    const scan = { ...demoEarlierScan(), date: at(2026, 1, 1).toISOString() };
    expect(daysUntilRetake(scan, at(2026, 1, 11))).toBe(20);
    expect(daysUntilRetake(scan, at(2026, 2, 5))).toBeLessThanOrEqual(0);
    expect(daysUntilRetake(undefined, at(2026, 1, 1))).toBe(0);
  });

  it("gives the demo a before and an after", () => {
    const change = compareScans(demoEarlierScan(), demoScanRecord("s", at(2026, 11, 12)));
    expect(change.improved.length).toBeGreaterThan(0);
    expect(summarizeScan(demoScanRecord("s", at(2026, 11, 12)).stats).focus.length).toBeGreaterThan(0);
  });
});

/* ---------- 3. delivery ---------- */

const me = (text: string): TalkTurn => demoTurn(text);
const partner = (text: string): TalkTurn => ({ role: "partner", text, words: [], durationMs: 0, scores: null });

describe("filler and hedge detection", () => {
  it("counts fillers, including two-word ones, and ignores the partner", () => {
    const report = analyzeDelivery([partner("Um, you know, basically hello."), me("Um, I finished it, you know. Uh, basically it is, um, done.")]);
    expect(Object.fromEntries(report.fillers.map((f) => [f.text, f.count]))).toEqual({ um: 2, "you know": 1, uh: 1, basically: 1 });
    expect(report.fillerTotal).toBe(5);
    expect(report.fillers[0]!.text).toBe("um");
  });

  it("timestamps each filler from word timing", () => {
    const report = analyzeDelivery([me("We are ready, um, to start.")]);
    const um = report.fillers.find((f) => f.text === "um")!;
    expect(um.atMs).toHaveLength(1);
    expect(um.atMs[0]).toBeGreaterThan(300);
  });

  it("treats 'like' as a filler only where it is one", () => {
    expect(analyzeDelivery([me("I would like a decision and I like the plan.")]).fillerTotal).toBe(0);
    expect(analyzeDelivery([me("It was like really late and, like, nobody answered.")]).fillers).toEqual([expect.objectContaining({ text: "like", count: 2 })]);
  });

  it("finds hedges, longest phrase first, without counting a word twice", () => {
    const report = analyzeDelivery([me("I think maybe we are sort of late. I think it is fine, if that makes sense. Probably.")]);
    expect(Object.fromEntries(report.hedges.map((h) => [h.text, h.count]))).toEqual({ "i think maybe": 1, "sort of": 1, "i think": 1, "if that makes sense": 1, probably: 1 });
    expect(report.hedgeTotal).toBe(5);
  });

  it("finds immediate repeats and overused words", () => {
    const report = analyzeDelivery([me("The the plan is is good. The vendor plan, the vendor budget, the vendor review and the vendor call.")]);
    expect(report.immediateRepeats.map((r) => r.text).sort()).toEqual(["is", "the"]);
    expect(report.overused).toEqual([{ text: "vendor", count: 4 }]);
  });

  it("measures sentence length and flags rambling", () => {
    const report = analyzeDelivery([me(DEMO_FREE_TALK)]);
    expect(report.sentenceCount).toBe(4);
    expect(report.longestSentence!.words).toBeGreaterThan(RAMBLING_WORDS);
    expect(report.rambling).toHaveLength(1);
    expect(report.rambling[0]).toMatch(/^We compared three providers/);
    expect(report.averageSentence).toBeGreaterThan(10);
  });

  it("picks the weakest answer by issue density, ignoring one-liners", () => {
    const report = analyzeDelivery([partner("Hi."), me(DEMO_ANSWERS[0]!), partner("And?"), me("Today I am working on the security checklist and testing starts on Monday."), partner("Ok."), me(DEMO_ANSWERS[3]!)]);
    expect(report.weakestTurn).toBe(1);
    expect(report.turns.map((t) => t.turn)).toEqual([1, 3, 5]);
    expect(analyzeDelivery([me("Today I am working on the security checklist and testing starts on Monday.")]).weakestTurn).toBeNull();
  });

  it("works from a bare transcript when there is no word timing", () => {
    const plain: TalkTurn = { role: "me", text: "Um, I think maybe it is fine, you know.", words: [], durationMs: 6000, scores: null };
    const report = analyzeDelivery([plain]);
    expect(report.fillerTotal).toBe(2);
    expect(report.hedgeTotal).toBe(1);
    expect(report.fillers[0]!.atMs).toEqual([]);
    expect(report.longPauses).toBeNull();
    expect(report.paceEstimated).toBe(true);
    expect(report.wordsPerMinute).toBe(90);
  });

  it("tightens an answer by rule", () => {
    expect(tightenByRules("Um, I think maybe we are, you know, sort of on track. Basically it is is done.")).toBe("We are on track. It is done.");
    expect(tightenByRules("We ship on Monday.")).toBe("We ship on Monday.");
  });
});

describe("pace and pause stats on unscripted speech", () => {
  it("computes words per minute from word timing, across turns", () => {
    const turn = me("We finished the review and testing starts on Monday");
    const first = turn.words[0]!;
    const last = turn.words[turn.words.length - 1]!;
    const span = last.offsetMs! + last.durationMs! - first.offsetMs!;
    const report = analyzeDelivery([turn]);
    expect(report.paceEstimated).toBe(false);
    expect(report.wordsPerMinute).toBe(Math.round((turn.words.length / span) * 60_000));
    expect(report.wordCount).toBe(9);
    const two = analyzeDelivery([turn, partner("Go on."), turn]);
    expect(two.wordsPerMinute).toBe(report.wordsPerMinute);
    expect(two.speakingMs).toBe(turn.durationMs * 2);
  });

  it("finds a long pause, with the words around it and when it happened", () => {
    const report = analyzeDelivery([partner("Well?"), me("It is basically / very close to done.")]);
    expect(report.longPauses).toHaveLength(1);
    expect(report.longPauses![0]).toMatchObject({ after: "basically", before: "very", ms: 1150 });
    expect(report.longPauses![0]!.atMs).toBeGreaterThan(0);
    expect(analyzeDelivery([me("It is very close to done.")]).longPauses).toEqual([]);
  });

  it("places pauses in a later turn on the talk's clock", () => {
    const first = me("We are ready to start today.");
    const report = analyzeDelivery([first, me("I need / three more days.")]);
    expect(report.longPauses![0]!.atMs).toBeGreaterThan(first.durationMs);
  });

  it("builds a turn from an Azure outcome, with scores marked as unscripted material", () => {
    const turn = turnFromOutcome({ segments: demoSegments(), transcript: "", audio: null, durationMs: 21000 });
    expect(turn.words.length).toBe(47);
    expect(turn.words[0]!.offsetMs).toBe(0);
    expect(turn.scores!.fluency).toBeGreaterThan(70);
    expect(turn.words.find((w) => w.text === "very")!.worst).toMatchObject({ phoneme: "v", heardAs: "b" });
    const plain = turnFromOutcome({ segments: [], transcript: " hello there ", audio: null, durationMs: 1500 });
    expect(plain).toMatchObject({ text: "hello there", words: [], scores: null, durationMs: 1500 });
  });
});

describe("one correction per turn", () => {
  it("raises the worst sound slip, with what to change physically", () => {
    const c = pickCorrection(me("I think the vendor review went very well."))!;
    expect(c.kind).toBe("sound");
    expect(c.about).toBe("very");
    expect(c.message).toMatch(/lips/i);
  });
  it("falls back to fillers, then hedges, and stays silent when the turn is fine", () => {
    expect(pickCorrection(me("Um, we are, uh, ready, um, to start."))).toMatchObject({ kind: "filler", about: "um" });
    expect(pickCorrection(me("I guess we are sort of ready."))!.kind).toBe("hedge");
    expect(pickCorrection(me("We are ready to start on Monday."))).toBeNull();
  });
  it("has the six scenarios, a scripted partner and custom scenarios", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(["standup", "deadline", "client", "interview", "smalltalk", "explain"]);
    const s = SCENARIOS[0]!;
    expect(scriptedReply(s, 1)).toBe(s.followUps[0]);
    expect(scriptedReply(s, 99)).toBeNull();
    expect(customScenario("  Ask my landlord for a repair ").setup).toMatch(/Ask my landlord for a repair/);
  });
});

/* ---------- 4. pitch ---------- */

function tone(hz: number | ((t: number) => number), seconds: number, rate = 16000, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const f = typeof hz === "number" ? hz : hz(i / rate);
    phase += (2 * Math.PI * f) / rate;
    out[i] = amplitude * Math.sin(phase);
  }
  return out;
}

describe("pitch extraction on a known test tone", () => {
  it("finds 220 Hz in a 220 Hz tone", () => {
    const contour = extractPitch(tone(220, 0.5), 16000);
    expect(contour.hz.length).toBeGreaterThan(30);
    expect(contour.hz.every((v) => v !== null)).toBe(true);
    expect(medianHz(contour)!).toBeGreaterThan(218);
    expect(medianHz(contour)!).toBeLessThan(222);
  });

  it("is accurate across the speaking range and at a 48 kHz sample rate", () => {
    for (const hz of [100, 150, 300]) {
      const m = medianHz(extractPitch(tone(hz, 0.4), 16000))!;
      expect(Math.abs(m - hz) / hz).toBeLessThan(0.02);
    }
    expect(Math.abs(medianHz(extractPitch(tone(180, 0.4, 48000), 48000))! - 180)).toBeLessThan(3);
  });

  it("reports silence and noise-free gaps as unvoiced", () => {
    expect(extractPitch(new Float32Array(8000), 16000).hz.every((v) => v === null)).toBe(true);
    const gap = new Float32Array(16000);
    gap.set(tone(200, 0.4), 0);
    const contour = extractPitch(gap, 16000);
    expect(contour.hz[5]).not.toBeNull();
    expect(contour.hz[contour.hz.length - 5]).toBeNull();
  });

  it("follows a rising tone", () => {
    const contour = smoothContour(extractPitch(tone((t) => 150 + 100 * t, 1), 16000));
    const voiced = contour.hz.filter((v): v is number => v !== null);
    expect(voiced[voiced.length - 3]!).toBeGreaterThan(voiced[2]! + 60);
    expect(pitchRange(contour)!).toBeGreaterThan(5);
  });

  it("measures range in semitones relative to the speaker, so register does not matter", () => {
    const low = extractPitch(tone((t) => 100 * Math.pow(2, t / 2), 1), 16000);
    const high = extractPitch(tone((t) => 200 * Math.pow(2, t / 2), 1), 16000);
    expect(Math.abs(pitchRange(low)! - pitchRange(high)!)).toBeLessThan(0.6);
    expect(pitchRange(extractPitch(tone(200, 0.5), 16000))!).toBeLessThan(0.3);
    const st = toSemitones(low).filter((v): v is number => v !== null);
    expect(Math.min(...st)).toBeLessThan(0);
    expect(Math.max(...st)).toBeGreaterThan(0);
  });

  it("removes a single-frame blip", () => {
    const raw: Contour = { timesMs: [0, 10, 20, 30, 40, 50, 60], hz: [200, 201, 400, 202, null, 300, null] };
    expect(smoothContour(raw).hz).toEqual([200, 201, 202, 202, null, null, null]);
  });
});

describe("contour comparison", () => {
  const { model, mine, modelWords, myWords } = demoContours("I think we need three more weeks to finish testing.");
  it("flags flat intonation and a shifted stress peak", () => {
    const result = compareContours(model, mine, modelWords, myWords);
    expect(result.modelRange!).toBeGreaterThan(result.myRange! * 2);
    expect(result.flat).toBe(true);
    expect(result.modelPeakWord).toBe("think");
    expect(result.myPeakWord).not.toBe("think");
    expect(result.stressShifted).toBe(true);
  });
  it("does not flag a match, or a model that barely moves", () => {
    expect(compareContours(model, model, modelWords, modelWords)).toMatchObject({ flat: false, stressShifted: false });
    expect(compareContours(mine, mine).flat).toBe(false);
    expect(compareContours(model, mine).modelPeakWord).toBeNull();
  });
  it("gives a mean pitch per word", () => {
    const perWord = pitchPerWord(model, modelWords);
    expect(perWord).toHaveLength(modelWords.length);
    expect(perWord[1]!).toBeGreaterThan(perWord[0]!);
  });
  it("chunks a sentence for shadowing", () => {
    expect(chunkSentence("I think we need three more weeks to finish testing, so I would like to move the launch date.")).toEqual([
      "I think we need three more weeks to finish testing,",
      "so I would like to move the launch date.",
    ]);
    expect(chunkSentence("Thank you all.")).toEqual(["Thank you all."]);
    const long = chunkSentence("We compared three providers and the best one is cheaper but it needs a longer setup and more people");
    expect(long.length).toBeGreaterThan(1);
    expect(long.every((c) => c.split(" ").length >= 3)).toBe(true);
    expect(long.join(" ")).toBe("We compared three providers and the best one is cheaper but it needs a longer setup and more people");
  });
});

/* ---------- 6. trust ---------- */

describe("retry cap", () => {
  it("defines clear as a threshold, not 100", () => {
    expect(isClear(80)).toBe(true);
    expect(isClear(79.6)).toBe(true);
    expect(isClear(79.4)).toBe(false);
    expect(isClear(null)).toBe(false);
  });
  it("stops at clear, offers another try, then stops for good after three", () => {
    expect(MAX_TRIES).toBe(3);
    expect(tryState(85, 1)).toBe("clear");
    expect(tryState(60, 1)).toBe("again");
    expect(tryState(60, 2)).toBe("again");
    expect(tryState(60, 3)).toBe("capped");
    expect(tryState(null, 3)).toBe("capped");
    expect(tryState(90, 3)).toBe("clear");
    expect([0, 1, 2, 3, 4].map(triesLeft)).toEqual([3, 2, 1, 0, 0]);
  });
});

describe("low scores need something to change", () => {
  const v = { phoneme: "v", accuracy: 30, alternatives: [{ phoneme: "b", score: 90 }] };
  it("explains a low word by its weakest sound, with the habit that caused it", () => {
    const e = explainLowWord([{ phoneme: "ɛ", accuracy: 90, alternatives: [] }, v])!;
    expect(e).toMatchObject({ phoneme: "v", heardAs: "b" });
    expect(e.instruction).toMatch(/top teeth/);
    expect(e.instruction).toMatch(/lips never touch/);
  });
  it("does not flag a word it cannot explain, a clear word, or one I overrode", () => {
    expect(explainLowWord([{ phoneme: "ɬ", accuracy: 20, alternatives: [] }])).toBeNull();
    expect(explainLowWord([{ phoneme: "v", accuracy: 85, alternatives: [] }])).toBeNull();
    expect(shouldFlag({ accuracy: 40, phonemes: [{ phoneme: "ɬ", accuracy: 20, alternatives: [] }] }, false)).toBe(false);
    expect(shouldFlag({ accuracy: 40, phonemes: [v] }, false)).toBe(true);
    expect(shouldFlag({ accuracy: 40, phonemes: [v] }, true)).toBe(false);
    expect(shouldFlag({ accuracy: 92, phonemes: [v] }, false)).toBe(false);
    expect(shouldFlag({ accuracy: null, phonemes: [] }, false)).toBe(false);
  });
});

describe("'this was fine' override", () => {
  const stats = { v: { count: 3, sum: 30 + 90 + 90, lowCount: 1, examples: ["very", "van"] }, ɛ: stat(2, 90), i: stat(1, 95) };
  const override: Override = { id: "o", date: "2026-01-01", resultId: "r", refIndex: 4, word: "very", contributions: contributionsOf([{ phoneme: "v", accuracy: 30 }, { phoneme: "ɛ", accuracy: 90 }, { phoneme: "i", accuracy: 95 }]) };

  it("takes the word's sounds back out of the stats, so it stops counting against mastery", () => {
    const adjusted = applyOverrides(stats, [override]);
    expect(adjusted.v).toEqual({ count: 2, sum: 180, lowCount: 0, examples: ["van"] });
    expect(adjusted.v!.sum / adjusted.v!.count).toBe(90);
    expect(adjusted.ɛ!.count).toBe(1);
    expect(adjusted.i).toBeUndefined();
  });
  it("leaves the original untouched and does nothing without overrides", () => {
    expect(stats.v.count).toBe(3);
    expect(applyOverrides(stats, [])).toEqual(stats);
  });
  it("ignores sounds the take does not have", () => {
    expect(applyOverrides({ m: stat(2, 90) }, [override])).toEqual({ m: stat(2, 90) });
  });
});

describe("thumbs on coaching notes", () => {
  const thumb = (text: string, vote: "up" | "down", day: number): Thumb => ({ id: text + day, date: `2026-01-${String(day).padStart(2, "0")}`, noteKey: noteKey("priority", text), text, vote });
  it("keeps the latest vote per note and lists recent dislikes for the coach", () => {
    const thumbs = [thumb("Slow down", "down", 1), thumb("Fix /v/", "up", 2), thumb("Slow down", "up", 3), thumb("Add pitch", "down", 4), thumb("Pause more", "down", 5)];
    expect(latestVotes(thumbs).get(noteKey("priority", "slow down  "))!.vote).toBe("up");
    expect(recentDislikes(thumbs)).toEqual(["Pause more", "Add pitch"]);
    expect(recentDislikes(thumbs, 1)).toEqual(["Pause more"]);
    expect(recentDislikes([])).toEqual([]);
  });
});

/* ---------- 7. words and events ---------- */

describe("my words", () => {
  const now = at(2026, 1, 10);
  let n = 0;
  const id = () => `w${++n}`;

  it("cleans and parses bulk vocabulary", () => {
    expect(parseBulk("Stakeholder\n  go-to-market, EBITDA;  stakeholder\n\n!!\nx")).toEqual(["stakeholder", "go-to-market", "ebitda"]);
    expect(cleanEntry("  “Vendor” ")).toBe("vendor");
    expect(cleanEntry("a")).toBeNull();
  });

  it("adds only new words and remembers where they came from", () => {
    const first = addWords([], ["Vendor", "budget"], "bulk", "azure", now, id);
    expect(first.added).toBe(2);
    const second = addWords(first.words, ["vendor", "review"], "saved", "azure", now, id);
    expect(second.added).toBe(1);
    expect(second.words.map((w) => [w.word, w.from])).toEqual([["vendor", "bulk"], ["budget", "bulk"], ["review", "saved"]]);
    expect(isSaved(second.words, " Review ")).toBe(true);
    expect(isSaved(second.words, "launch")).toBe(false);
  });

  it("puts saved words in the spaced review queue", () => {
    const word = (w: string, reviews: SavedWord["reviews"], added = 1): SavedWord => ({ id: w, word: w, addedAt: at(2026, 1, added).toISOString(), from: "saved", source: "azure", reviews });
    const fresh = word("vendor", []);
    const good = word("budget", [{ date: at(2026, 1, 9).toISOString(), score: 90 }]);
    const slipped = word("review", [{ date: at(2026, 1, 9).toISOString(), score: 40 }]);
    const unscored = word("launch", [{ date: at(2026, 1, 9).toISOString(), score: null }]);
    expect(wordReview(fresh, now)).toBeNull();
    expect(wordReview(good, now)).toMatchObject({ intervalDays: 3, due: false });
    expect(wordReview(slipped, now)).toMatchObject({ intervalDays: 1, due: true });
    expect(dueWords([good, slipped, fresh, unscored], now).map((w) => w.word)).toEqual(["vendor", "launch", "review"]);
    expect(dueWords([good], at(2026, 1, 12)).map((w) => w.word)).toEqual(["budget"]);
  });

  it("feeds saved words into a sound's drill and wraps a word in a carrier line", () => {
    const words = addWords([], ["vendor", "budget", "value"], "saved", "azure", now, id).words;
    expect(savedWordsWithSound(words, new Set(["vendor", "value", "very"]))).toEqual(["vendor", "value"]);
    expect(carrierLine("vendor")).toBe("vendor. I said vendor clearly.");
  });
});

describe("event-plan generator", () => {
  const script = "Good morning. I want to give a very quick update on the vendor review. We shipped the beta this week. I think we need three more weeks, so I would like to move the launch date.";
  const hard = new Set(["very", "vendor", "review", "think", "three", "this"]);
  const plan = (today: Date, eventDay: string) => buildEventPlan({ eventDay, today, scriptText: script, hardWords: hard });

  it("finds the risky words and the hardest sentences in the script", () => {
    expect(riskyWordsIn(script, hard)).toEqual(["very", "vendor", "review", "this", "think", "three"]);
    const sentences = hardSentencesIn(script, riskyWordsIn(script, hard));
    expect(sentences[0]).toMatch(/^I want to give a very quick update/);
    expect(sentences).toHaveLength(3);
    expect(hardSentencesIn(script, [])[0]).toMatch(/^I think we need three more weeks/);
  });

  it("plans every day from today to the event, ending on the day itself", () => {
    const p = plan(at(2026, 3, 1), "2026-03-08");
    expect(p.days.map((d) => d.day)).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]);
    expect(p.days.map((d) => d.daysLeft)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("moves from risky words, to shadowing, to full run-throughs with a pace target", () => {
    const p = plan(at(2026, 3, 1), "2026-03-08");
    const kinds = p.days.map((d) => d.tasks.map((t) => t.kind).join("+"));
    expect(kinds[0]).toBe("read+words");
    expect(kinds.slice(1, 5).join(" ")).toContain("shadow");
    expect(kinds.slice(-3)).toEqual(["run+run", "run+run", "run"]);
    expect(p.days[p.days.length - 1]!.tasks[0]!.detail).toMatch(/Do not drill today/);
    expect(p.days[p.days.length - 2]!.tasks[0]!.detail).toMatch(/130 to 160 words a minute/);
    expect(p.days[0]!.tasks[1]!.detail).toMatch(/very, vendor, review/);
    expect(p.targetSeconds).toBe(Math.round((p.wordCount / PACE_TARGET.aim) * 60));
  });

  it("gives every task a unique, stable id", () => {
    const ids = plan(at(2026, 3, 1), "2026-03-08").days.flatMap((d) => d.tasks.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(plan(at(2026, 3, 1), "2026-03-08").days[0]!.tasks[0]!.id).toBe("2026-03-01:read:1");
  });

  it("handles an event today, tomorrow, far away and in the past", () => {
    expect(plan(at(2026, 3, 8), "2026-03-08").days.map((d) => d.tasks[0]!.kind)).toEqual(["run"]);
    expect(plan(at(2026, 3, 7), "2026-03-08").days).toHaveLength(2);
    const far = plan(at(2026, 1, 1), "2026-03-08");
    expect(far.days).toHaveLength(MAX_PLAN_DAYS);
    expect(far.days[0]!.day).toBe("2026-02-23");
    expect(plan(at(2026, 3, 9), "2026-03-08").days).toEqual([]);
  });

  it("shows the next event until it has passed", () => {
    const events = [
      { id: "a", name: "Old", day: "2026-03-01", scriptId: "s", createdAt: "", done: [] },
      { id: "b", name: "Board", day: "2026-03-20", scriptId: "s", createdAt: "", done: [] },
      { id: "c", name: "Review", day: "2026-03-08", scriptId: "s", createdAt: "", done: [] },
    ];
    expect(activeEvent(events, at(2026, 3, 5))!.name).toBe("Review");
    expect(activeEvent(events, at(2026, 3, 8))!.name).toBe("Review");
    expect(activeEvent(events, at(2026, 3, 9))!.name).toBe("Board");
    expect(activeEvent(events, at(2026, 3, 21))).toBeNull();
  });
});

describe("modes export and import", () => {
  const data = {
    ...EMPTY_MODES,
    scans: [demoEarlierScan(), { ...demoEarlierScan(), id: "mine", source: "azure" as const }],
    words: [{ id: "w1", word: "vendor", addedAt: "2026-01-01", from: "saved" as const, source: "azure" as const, reviews: [] }],
    settings: { spanishHints: true },
  };
  it("exports my data next to the history, without sample data, and reads it back", () => {
    const file = JSON.stringify({ ...buildExport([], [], at(2026, 1, 1)), modes: exportableModes(data) });
    expect(parseImport(file).sessions).toEqual([]);
    const back = parseModesImport(file)!;
    expect(back.scans.map((s) => s.id)).toEqual(["mine"]);
    expect(back.words[0]!.word).toBe("vendor");
    expect(back.settings.spanishHints).toBe(true);
  });
  it("reads old files with no modes block, merges without duplicates, and keeps my settings", () => {
    expect(parseModesImport(JSON.stringify(buildExport([], [], at(2026, 1, 1))))).toBeNull();
    expect(parseModesImport("nope")).toBeNull();
    const merged = mergeModes(data, { ...EMPTY_MODES, scans: [{ ...demoEarlierScan(), id: "mine" }, { ...demoEarlierScan(), id: "new" }], words: [{ ...data.words[0]!, id: "other" }] });
    expect(merged.scans.map((s) => s.id)).toEqual(["demo-scan-0", "mine", "new"]);
    expect(merged.words).toHaveLength(1);
    expect(merged.settings.spanishHints).toBe(true);
  });
});

describe("drawing two voices over the same words", () => {
  const from = [{ text: "we", startMs: 0, endMs: 100 }, { text: "ship", startMs: 200, endMs: 400 }];
  const to = [{ text: "we", startMs: 0, endMs: 200 }, { text: "ship", startMs: 300, endMs: 900 }];
  it("maps a moment in my take onto the model's clock, word by word", () => {
    expect(alignTime(50, from, to)).toBe(100);
    expect(alignTime(150, from, to)).toBe(250);
    expect(alignTime(300, from, to)).toBe(600);
    expect(alignTime(999, from, to)).toBe(900);
  });
  it("falls back to proportion when the words do not line up", () => {
    expect(alignTime(200, from, [to[0]!])).toBe(100);
    expect(alignTime(120, [], to)).toBe(120);
  });
  it("names the words where my pitch is furthest from the model", () => {
    const { model, mine, modelWords, myWords } = demoContours("I think we need three more weeks to finish testing.");
    const gaps = stressGaps(model, mine, modelWords, myWords);
    expect(gaps[0]).toMatchObject({ word: "think" });
    expect(gaps[0]!.gap).toBeGreaterThan(2);
    expect(gaps.length).toBeLessThanOrEqual(2);
    expect(stressGaps(model, model, modelWords, modelWords)).toEqual([]);
    expect(stressGaps(model, mine, modelWords, [])).toEqual([]);
  });
});
