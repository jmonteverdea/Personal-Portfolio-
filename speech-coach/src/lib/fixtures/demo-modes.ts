import { phonemeStatsFor } from "../history";
import type { Contour, TimedWord } from "../modes/pitch";
import type { ScanRecord, TalkTurn, TalkWord } from "../modes/types";
import { normalizeWord, splitWords } from "../text";
import type { PhonemeStat } from "../types";
import { simulateScriptTake } from "./demo-learning";
import { buildDemoResult } from "./demo";

/**
 * Sample data for the coaching modes, so each one can be walked in Demo mode
 * with no keys and no microphone. Everything here is marked source "demo".
 */

const round = (n: number): number => Math.round(n * 10) / 10;

function shift(stats: Record<string, PhonemeStat>, by: number, weakOnly = false): Record<string, PhonemeStat> {
  const out: Record<string, PhonemeStat> = {};
  for (const [phoneme, s] of Object.entries(stats)) {
    const average = s.sum / s.count;
    const moved = Math.max(0, Math.min(100, average + (weakOnly && average >= 80 ? by * 0.2 : by)));
    out[phoneme] = { ...s, sum: round(moved * s.count), lowCount: moved < 60 ? s.count : 0 };
  }
  return out;
}

/** The scan a demo run "records": a little better than the earlier sample scan on the weak sounds. */
export function demoScanRecord(id: string, now: Date): ScanRecord {
  const take = simulateScriptTake("demo-scan-take", now, 6);
  return { id, date: now.toISOString(), source: "demo", stats: phonemeStatsFor(take), accuracy: take.scores?.accuracy ?? null, fluency: take.scores?.fluency ?? null, prosody: take.scores?.prosody ?? null, parts: 6 };
}

/** An earlier sample scan, so the first demo scan already has a before to compare with. */
export function demoEarlierScan(): ScanRecord {
  const result = buildDemoResult();
  return {
    id: "demo-scan-0",
    date: "2026-10-12T09:00:00.000Z",
    source: "demo",
    stats: shift(phonemeStatsFor(result), -6, true),
    accuracy: result.scores ? round(result.scores.accuracy - 5) : null,
    fluency: result.scores ? round(result.scores.fluency - 4) : null,
    prosody: result.scores?.prosody == null ? null : round(result.scores.prosody - 6),
    parts: 6,
  };
}

/** Sounds the sample speaker gets wrong, and what they come out as. */
const SLIPS: Record<string, { phoneme: string; heardAs: string; accuracy: number }> = {
  very: { phoneme: "v", heardAs: "b", accuracy: 41 },
  vendor: { phoneme: "v", heardAs: "b", accuracy: 48 },
  think: { phoneme: "θ", heardAs: "t", accuracy: 44 },
  three: { phoneme: "θ", heardAs: "t", accuracy: 47 },
  this: { phoneme: "ð", heardAs: "d", accuracy: 58 },
  budget: { phoneme: "dʒ", heardAs: "j", accuracy: 55 },
  finished: { phoneme: "ɪ", heardAs: "i", accuracy: 62 },
};

/** Build a spoken turn from text: plausible word timings, a long pause where marked with " / ", and known slips. */
export function demoTurn(text: string): TalkTurn {
  const clean = text.replace(/\s\/\s/g, " ");
  const pauseAfter = new Set<number>();
  let count = 0;
  for (const piece of text.split(/\s+/)) {
    if (piece === "/") pauseAfter.add(count - 1);
    else count += 1;
  }
  let cursor = 0;
  const words: TalkWord[] = splitWords(clean).map((raw, i) => {
    const norm = normalizeWord(raw);
    const slip = SLIPS[norm];
    const durationMs = 170 + Math.min(6, norm.length) * 38;
    const word: TalkWord = {
      text: norm,
      offsetMs: cursor,
      durationMs,
      accuracy: slip ? slip.accuracy : 88 + ((i * 5) % 11),
      worst: slip ? { phoneme: slip.phoneme, accuracy: slip.accuracy - 12, heardAs: slip.heardAs } : null,
    };
    cursor += durationMs + (pauseAfter.has(i) ? 1150 : 70 + ((i * 13) % 60));
    return word;
  });
  const scored = words.filter((w) => w.accuracy !== null);
  return {
    role: "me",
    text: clean,
    words,
    durationMs: cursor + 300,
    scores: { accuracy: round(scored.reduce((n, w) => n + (w.accuracy ?? 0), 0) / scored.length), fluency: 76, prosody: 68 },
  };
}

/** What the sample speaker says in a demo conversation, turn by turn. Written to contain real delivery issues. */
export const DEMO_ANSWERS = [
  "Um, yesterday I finished the vendor review, and, you know, I think maybe we are sort of on track for this week.",
  "Today I am, uh, working on the the security checklist. I think it is basically / very close, and I just need three more days.",
  "No blockers. I guess I just need, like, a decision on the budget by Thursday, if that makes sense.",
  "That is all from me. Thank you.",
];

export const DEMO_FREE_TALK =
  "So, um, this week I worked on the vendor review, and I think it went very well. " +
  "We compared three providers and, you know, the best one is sort of cheaper but it needs a longer setup, and I think maybe the team is a little bit worried about the timeline because the security review is still open and nobody has confirmed the date and we also have the budget meeting on Thursday which could change everything. " +
  "Basically, I want to move the launch date. " +
  "I think this is the the right call, / and I will explain why on Thursday.";

/** Model and "mine" pitch contours for a demo sentence. The model moves, the sample speaker stays flat and stresses a later word. */
export function demoContours(sentence: string): { model: Contour; mine: Contour; modelWords: TimedWord[]; myWords: TimedWord[] } {
  const raw = splitWords(sentence);
  const content = raw.map((w) => normalizeWord(w).length > 4);
  const stressAt = Math.max(0, content.indexOf(true));
  // The sample speaker stresses the last content word before the final one, a common transfer from Spanish rhythm.
  const lastStress = Math.max(stressAt, content.slice(0, -1).lastIndexOf(true));
  const build = (baseHz: number, swing: number, peakWord: number, wordMs: number, minor: number) => {
    const timesMs: number[] = [];
    const hz: (number | null)[] = [];
    const words: TimedWord[] = [];
    let clock = 120;
    raw.forEach((text, i) => {
      const length = wordMs + Math.min(6, normalizeWord(text).length) * 22;
      words.push({ text: normalizeWord(text), startMs: clock, endMs: clock + length });
      for (let t = 0; t < length; t += 10) {
        const progress = (clock + t) / (raw.length * (wordMs + 110));
        const declination = -3 * progress;
        const accent = i === peakWord ? swing * Math.sin((t / length) * Math.PI) : content[i] ? swing * minor * Math.sin((t / length) * Math.PI) : 0;
        const fall = i === raw.length - 1 ? -swing * 0.5 * (t / length) : 0;
        timesMs.push(clock + t);
        hz.push(baseHz * Math.pow(2, (declination * (swing / 5) + accent + fall) / 12));
      }
      clock += length;
      for (let t = 0; t < 40; t += 10) {
        timesMs.push(clock + t);
        hz.push(null);
      }
      clock += 40;
    });
    return { contour: { timesMs, hz }, words };
  };
  const model = build(196, 5.2, stressAt, 190, 0.35);
  const mine = build(128, 1.6, lastStress, 215, 0.08);
  return { model: model.contour, mine: mine.contour, modelWords: model.words, myWords: mine.words };
}
