import type { PhonemeStat } from "../types";
import type { ScanRecord } from "./types";

/**
 * The baseline scan. A fixed passage and sentence set that touches every
 * English sound in more than one position, with extra weight on the contrasts
 * a Spanish speaker most often merges. The aim is clear speech, not a
 * different accent: a sound is done once it is clearly understood.
 */

export const SCAN_PARTS: { title: string; text: string }[] = [
  { title: "Opening a meeting", text: "Good morning. Thank you for joining this meeting. I think three things went very well this week, and both teams finished their work." },
  { title: "Plans and reviews", text: "We should check each change before the launch. The usual schedule is a short review first on Thursday, then we share the vision with the whole office." },
  { title: "Moving things", text: "Please move the big blue bag next to the red box. Bob gave five of us a ride, and Vicky drove the van back." },
  { title: "Short and long vowels", text: "It is easy to sit still in this seat, but his ship leaves soon. The full moon looked good, and a cup of hot coffee was enough." },
  { title: "Glides and diphthongs", text: "Yes, you can use my young manager's project budget in July. How about a job in the south? The boy will enjoy the toy now." },
  { title: "Word stress", text: "We record a record of the project, and we project the result. Please present the present to the photographer in the photograph." },
];

export type Position = "start" | "middle" | "end";

export interface ScanTarget {
  /** How much this sound matters for a Spanish speaker's clarity. 1 is ordinary. */
  weight: number;
  /** Words in the scan that contain the sound, and where in the word it sits. */
  words: [word: string, position: Position][];
}

const t = (weight: number, ...words: [string, Position][]): ScanTarget => ({ weight, words });

/** Hand-checked against the passage. The unit tests verify every word is really in it. */
export const SCAN_TARGETS: Record<string, ScanTarget> = {
  p: t(1, ["please", "start"], ["ship", "end"], ["cup", "end"], ["project", "start"]),
  b: t(2, ["big", "start"], ["bob", "end"], ["job", "end"], ["about", "middle"], ["budget", "start"]),
  t: t(2, ["teams", "start"], ["went", "end"], ["next", "end"], ["hot", "end"], ["still", "middle"], ["result", "end"]),
  d: t(2, ["good", "end"], ["red", "end"], ["ride", "end"], ["drove", "start"], ["record", "end"]),
  k: t(1.5, ["thank", "end"], ["week", "end"], ["can", "start"], ["back", "end"], ["vicky", "middle"]),
  ɡ: t(1, ["good", "start"], ["gave", "start"], ["big", "end"], ["bag", "end"]),
  f: t(1, ["for", "start"], ["five", "start"], ["office", "middle"], ["enough", "end"]),
  v: t(3, ["very", "start"], ["van", "start"], ["vicky", "start"], ["five", "end"], ["gave", "end"], ["move", "end"], ["review", "middle"]),
  θ: t(3, ["thank", "start"], ["think", "start"], ["three", "start"], ["both", "end"], ["south", "end"]),
  ð: t(3, ["this", "start"], ["their", "start"], ["then", "start"], ["the", "start"]),
  s: t(1, ["seat", "start"], ["soon", "start"], ["us", "end"], ["yes", "end"], ["next", "middle"]),
  z: t(3, ["is", "end"], ["his", "end"], ["leaves", "end"], ["teams", "end"], ["easy", "middle"], ["result", "middle"]),
  ʃ: t(3, ["should", "start"], ["share", "start"], ["short", "start"], ["ship", "start"], ["finished", "end"]),
  ʒ: t(1, ["usual", "middle"], ["vision", "middle"]),
  h: t(2, ["his", "start"], ["hot", "start"], ["how", "start"], ["whole", "start"]),
  tʃ: t(2, ["check", "start"], ["change", "start"], ["each", "end"], ["launch", "end"]),
  dʒ: t(3, ["joining", "start"], ["job", "start"], ["july", "start"], ["change", "end"], ["manager's", "middle"], ["budget", "middle"]),
  m: t(1, ["morning", "start"], ["move", "start"], ["teams", "middle"], ["moon", "start"]),
  n: t(1, ["now", "start"], ["then", "end"], ["van", "end"], ["finished", "middle"]),
  ŋ: t(2, ["morning", "end"], ["meeting", "end"], ["young", "end"], ["think", "middle"]),
  w: t(1, ["well", "start"], ["week", "start"], ["work", "start"], ["was", "start"]),
  l: t(1, ["launch", "start"], ["well", "end"], ["full", "end"], ["blue", "middle"]),
  r: t(2, ["red", "start"], ["ride", "start"], ["review", "start"], ["three", "middle"], ["drove", "middle"]),
  j: t(2, ["you", "start"], ["yes", "start"], ["young", "start"], ["use", "start"]),
  i: t(2, ["meeting", "middle"], ["week", "middle"], ["easy", "start"], ["seat", "middle"], ["leaves", "middle"]),
  ɪ: t(3, ["this", "middle"], ["think", "middle"], ["sit", "middle"], ["still", "middle"], ["ship", "middle"], ["big", "middle"]),
  eɪ: t(1, ["change", "middle"], ["gave", "middle"], ["thursday", "end"]),
  ɛ: t(1, ["went", "middle"], ["check", "middle"], ["red", "middle"], ["yes", "middle"]),
  æ: t(2, ["thank", "middle"], ["bag", "middle"], ["van", "middle"], ["back", "middle"]),
  ɑ: t(1, ["hot", "middle"], ["box", "middle"], ["job", "middle"]),
  ɔ: t(1, ["morning", "middle"], ["short", "middle"], ["launch", "middle"]),
  oʊ: t(1, ["both", "middle"], ["drove", "middle"], ["whole", "middle"]),
  ʊ: t(2, ["good", "middle"], ["should", "middle"], ["looked", "middle"], ["full", "middle"]),
  u: t(1, ["blue", "end"], ["move", "middle"], ["soon", "middle"], ["moon", "middle"]),
  ʌ: t(2, ["us", "start"], ["cup", "middle"], ["young", "middle"], ["enough", "middle"]),
  ə: t(2, ["about", "start"], ["vision", "middle"], ["the", "end"]),
  ɝ: t(2, ["work", "middle"], ["first", "middle"], ["thursday", "middle"]),
  ɚ: t(1, ["manager's", "middle"], ["photographer", "end"]),
  aɪ: t(1, ["five", "middle"], ["ride", "middle"], ["my", "end"], ["july", "end"]),
  aʊ: t(1, ["how", "end"], ["about", "middle"], ["south", "middle"], ["now", "end"]),
  ɔɪ: t(1, ["joining", "middle"], ["boy", "end"], ["enjoy", "end"], ["toy", "end"]),
};

/** A sound counts as clear at this average. Past it, the app stops asking for more. */
export const CLEAR = 80;

export type ClarityLevel = 1 | 2 | 3 | 4;

export const CLARITY_NAMES: Record<ClarityLevel, string> = {
  1: "Building",
  2: "Understood with effort",
  3: "Clear",
  4: "Clear throughout",
};

export const CLARITY_MEANING: Record<ClarityLevel, string> = {
  1: "Several sounds still get in the listener's way.",
  2: "People follow you, but some sounds make them work for it.",
  3: "People follow you easily. A few sounds are worth firming up.",
  4: "Nothing in your sounds slows a listener down.",
};

export interface SoundResult {
  phoneme: string;
  average: number;
  count: number;
  weight: number;
  examples: string[];
}

export interface FocusSound extends SoundResult {
  /** Why it ranks where it does: how far under clear, times how much it matters. */
  priority: number;
}

export interface ScanSummary {
  level: ClarityLevel;
  /** Share of scanned sounds that are clear, 0 to 1. */
  clearShare: number;
  clear: SoundResult[];
  focus: FocusSound[];
  sounds: number;
}

function weightOf(phoneme: string): number {
  return SCAN_TARGETS[phoneme]?.weight ?? 1;
}

/** Turn per-sound stats into the scan result: a level, what is already clear, and ranked focus sounds. */
export function summarizeScan(stats: Readonly<Record<string, PhonemeStat>>): ScanSummary {
  const all: SoundResult[] = Object.entries(stats)
    .filter(([, s]) => s.count > 0)
    .map(([phoneme, s]) => ({ phoneme, average: Math.round((s.sum / s.count) * 10) / 10, count: s.count, weight: weightOf(phoneme), examples: s.examples }));
  const clear = all.filter((s) => s.average >= CLEAR).sort((a, b) => b.average - a.average);
  const focus: FocusSound[] = all
    .filter((s) => s.average < CLEAR)
    .map((s) => ({ ...s, priority: Math.round((CLEAR - s.average) * s.weight * 10) / 10 }))
    .sort((a, b) => b.priority - a.priority || a.average - b.average);
  const clearShare = all.length ? clear.length / all.length : 0;
  const anyPoor = all.some((s) => s.average < 60);
  const level: ClarityLevel = all.length === 0 ? 1 : clearShare >= 0.9 && !anyPoor ? 4 : clearShare >= 0.75 ? 3 : clearShare >= 0.5 ? 2 : 1;
  return { level, clearShare, clear, focus, sounds: all.length };
}

export interface ScanChange {
  phoneme: string;
  before: number;
  after: number;
  delta: number;
}

export interface ScanComparison {
  levelBefore: ClarityLevel;
  levelAfter: ClarityLevel;
  /** Sounds that crossed into clear since the earlier scan. */
  nowClear: string[];
  improved: ScanChange[];
  slipped: ScanChange[];
}

/** Before and after between two scans. Changes under `noise` points are not reported. */
export function compareScans(before: ScanRecord, after: ScanRecord, noise = 4): ScanComparison {
  const a = summarizeScan(before.stats);
  const b = summarizeScan(after.stats);
  const changes: ScanChange[] = [];
  const nowClear: string[] = [];
  for (const [phoneme, stat] of Object.entries(after.stats)) {
    const prior = before.stats[phoneme];
    if (!prior || prior.count <= 0 || stat.count <= 0) continue;
    const was = prior.sum / prior.count;
    const is = stat.sum / stat.count;
    if (was < CLEAR && is >= CLEAR) nowClear.push(phoneme);
    if (Math.abs(is - was) >= noise) changes.push({ phoneme, before: Math.round(was), after: Math.round(is), delta: Math.round(is - was) });
  }
  return {
    levelBefore: a.level,
    levelAfter: b.level,
    nowClear,
    improved: changes.filter((c) => c.delta > 0).sort((x, y) => y.delta - x.delta),
    slipped: changes.filter((c) => c.delta < 0).sort((x, y) => x.delta - y.delta),
  };
}

/** Merge the per-part stats of one scan into one record of stats. */
export function mergeStats(parts: readonly Record<string, PhonemeStat>[]): Record<string, PhonemeStat> {
  const out: Record<string, PhonemeStat> = {};
  for (const part of parts) {
    for (const [phoneme, s] of Object.entries(part)) {
      const entry = (out[phoneme] ??= { count: 0, sum: 0, lowCount: 0, examples: [] });
      entry.count += s.count;
      entry.sum += s.sum;
      entry.lowCount += s.lowCount;
      for (const word of s.examples) if (entry.examples.length < 3 && !entry.examples.includes(word)) entry.examples.push(word);
    }
  }
  return out;
}

const RETAKE_DAYS = 30;

/** Days until the monthly retake is suggested. Zero or less means it is time. */
export function daysUntilRetake(latest: ScanRecord | undefined, now: Date): number {
  if (!latest) return 0;
  const elapsed = Math.floor((now.getTime() - new Date(latest.date).getTime()) / 86_400_000);
  return RETAKE_DAYS - elapsed;
}
