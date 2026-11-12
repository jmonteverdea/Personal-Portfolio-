import { computePacing } from "../pacing";
import { normalizeWord, splitSentences, splitWords } from "../text";
import type { LongPause, WordResult } from "../types";
import type { TalkTurn, TalkWord } from "./types";

/**
 * Delivery analysis for unscripted speech: fillers, hedges, repeats, pace,
 * pauses and rambling. Pure: computed from the transcript and word timings.
 */

const FILLERS_SINGLE = new Set(["um", "umm", "uh", "uhh", "er", "erm", "ah", "eh", "hmm", "mm", "basically", "literally", "actually"]);
const FILLERS_PHRASE = ["you know", "i mean", "you see"];
/** "like" is a filler only when it follows one of these, or opens the turn. A heuristic, not grammar. */
const LIKE_AFTER = new Set(["and", "so", "but", "was", "is", "it's", "just", "um", "uh", "like", "well"]);

const HEDGES = [
  "i think maybe", "if that makes sense", "i'm not sure", "i am not sure", "a little bit", "or something", "i feel like", "i would say",
  "sort of", "kind of", "i guess", "i think", "i suppose", "not sure", "maybe", "probably", "perhaps", "somewhat",
];

const STOPWORDS = new Set(
  "a an the and or but so to of in on at for from with by as is are was were be been am i you he she it we they me my your our their this that these those do does did will would can could should have has had not no yes if then than there here what which who when where how all any some more most very just also about into over up out its it's i'm we're that's don't".split(" "),
);

/** A sentence longer than this is flagged as rambling. Spoken sentences that land are usually under 25 words. */
export const RAMBLING_WORDS = 28;
const OVERUSED_MIN = 4;

export interface Counted {
  text: string;
  count: number;
  /** When each one happened, in milliseconds from the start of the talk. Empty without word timing. */
  atMs: number[];
}

export interface TurnDelivery {
  /** Index into the talk's turns. */
  turn: number;
  words: number;
  fillers: number;
  hedges: number;
  repeats: number;
  longestSentence: number;
  /** Issues per 100 words. The weakest answer has the highest. */
  density: number;
}

export interface DeliveryReport {
  wordCount: number;
  speakingMs: number;
  wordsPerMinute: number | null;
  /** True when pace comes from total speaking time, not word timing. */
  paceEstimated: boolean;
  longPauses: { ms: number; after: string; before: string; atMs: number }[] | null;
  fillers: Counted[];
  fillerTotal: number;
  fillersPerMinute: number | null;
  hedges: Counted[];
  hedgeTotal: number;
  immediateRepeats: Counted[];
  overused: { text: string; count: number }[];
  sentenceCount: number;
  averageSentence: number;
  longestSentence: { text: string; words: number } | null;
  rambling: string[];
  turns: TurnDelivery[];
  /** Index of my weakest answer, by issue density. Null when nothing stands out. */
  weakestTurn: number | null;
}

function bump(map: Map<string, Counted>, text: string, atMs: number | null): void {
  const entry = map.get(text) ?? { text, count: 0, atMs: [] };
  entry.count += 1;
  if (atMs !== null) entry.atMs.push(Math.round(atMs));
  map.set(text, entry);
}

const sorted = (map: Map<string, Counted>): Counted[] => [...map.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

interface Token {
  norm: string;
  atMs: number | null;
}

function tokensOf(turn: TalkTurn, startMs: number): Token[] {
  if (turn.words.length > 0) {
    return turn.words.map((w) => ({ norm: normalizeWord(w.text), atMs: w.offsetMs === null ? null : startMs + w.offsetMs })).filter((t) => t.norm.length > 0);
  }
  return splitWords(turn.text).map((w) => ({ norm: normalizeWord(w), atMs: null }));
}

/** Find fillers, hedges and immediate repeats in one turn's tokens. Longest phrases win, and nothing is counted twice. */
export function scanTokens(tokens: readonly Token[]): { fillers: Map<string, Counted>; hedges: Map<string, Counted>; repeats: Map<string, Counted> } {
  const fillers = new Map<string, Counted>();
  const hedges = new Map<string, Counted>();
  const repeats = new Map<string, Counted>();
  const used = new Array<boolean>(tokens.length).fill(false);
  const phraseAt = (i: number, phrase: string): boolean => {
    const parts = phrase.split(" ");
    return parts.every((part, k) => tokens[i + k]?.norm === part && !used[i + k]);
  };
  const take = (i: number, length: number) => {
    for (let k = 0; k < length; k++) used[i + k] = true;
  };

  const hedgeList = [...HEDGES].sort((a, b) => b.split(" ").length - a.split(" ").length);
  for (let i = 0; i < tokens.length; i++) {
    const hedge = hedgeList.find((h) => phraseAt(i, h));
    if (hedge) {
      bump(hedges, hedge, tokens[i]?.atMs ?? null);
      take(i, hedge.split(" ").length);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    const token = tokens[i] as Token;
    const phrase = FILLERS_PHRASE.find((p) => phraseAt(i, p));
    if (phrase) {
      bump(fillers, phrase, token.atMs);
      take(i, 2);
      continue;
    }
    const previous = tokens[i - 1]?.norm;
    if (FILLERS_SINGLE.has(token.norm) || (token.norm === "like" && (i === 0 || (previous !== undefined && LIKE_AFTER.has(previous))))) {
      bump(fillers, token.norm, token.atMs);
      used[i] = true;
    }
  }
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (token.norm === tokens[i - 1]?.norm && !FILLERS_SINGLE.has(token.norm)) bump(repeats, token.norm, token.atMs);
  }
  return { fillers, hedges, repeats };
}

function asWordResults(words: readonly TalkWord[], startMs: number, indexFrom: number): WordResult[] {
  return words.map((w, i) => ({
    index: indexFrom + i,
    text: w.text,
    spoken: null,
    status: "correct" as const,
    refIndex: indexFrom + i,
    sentenceIndex: 0,
    accuracy: w.accuracy,
    offsetMs: w.offsetMs === null ? null : startMs + w.offsetMs,
    durationMs: w.durationMs,
    phonemes: [],
    prosody: null,
  }));
}

/** Analyse my side of a conversation or a free talk. Partner turns are ignored. */
export function analyzeDelivery(turns: readonly TalkTurn[]): DeliveryReport {
  const fillers = new Map<string, Counted>();
  const hedges = new Map<string, Counted>();
  const repeats = new Map<string, Counted>();
  const overuse = new Map<string, number>();
  const perTurn: TurnDelivery[] = [];
  const pauses: DeliveryReport["longPauses"] = [];
  const sentences: { text: string; words: number }[] = [];
  let clock = 0;
  let wordCount = 0;
  let speakingMs = 0;
  let timedWords = 0;
  let timedSpanMs = 0;
  let allTimed = true;

  turns.forEach((turn, index) => {
    if (turn.role !== "me") return;
    const tokens = tokensOf(turn, clock);
    const found = scanTokens(tokens);
    const merge = (into: Map<string, Counted>, from: Map<string, Counted>) => {
      for (const c of from.values()) {
        const entry = into.get(c.text) ?? { text: c.text, count: 0, atMs: [] };
        entry.count += c.count;
        entry.atMs.push(...c.atMs);
        into.set(c.text, entry);
      }
    };
    merge(fillers, found.fillers);
    merge(hedges, found.hedges);
    merge(repeats, found.repeats);
    for (const t of tokens) if (t.norm.length > 3 && !STOPWORDS.has(t.norm) && !FILLERS_SINGLE.has(t.norm)) overuse.set(t.norm, (overuse.get(t.norm) ?? 0) + 1);

    const turnSentences = splitSentences(turn.text).map((text) => ({ text, words: splitWords(text).length }));
    sentences.push(...turnSentences);
    const sum = (map: Map<string, Counted>) => [...map.values()].reduce((n, c) => n + c.count, 0);
    const longest = turnSentences.reduce((n, s) => Math.max(n, s.words), 0);
    const issues = sum(found.fillers) + sum(found.hedges) + sum(found.repeats) + turnSentences.filter((s) => s.words > RAMBLING_WORDS).length * 2;
    perTurn.push({
      turn: index,
      words: tokens.length,
      fillers: sum(found.fillers),
      hedges: sum(found.hedges),
      repeats: sum(found.repeats),
      longestSentence: longest,
      density: tokens.length > 0 ? Math.round((issues / tokens.length) * 1000) / 10 : 0,
    });

    const timed = turn.words.filter((w) => w.offsetMs !== null && w.durationMs !== null);
    if (timed.length > 1) {
      const pacing = computePacing(asWordResults(turn.words, clock, wordCount));
      timedWords += pacing.spokenWordCount;
      timedSpanMs += pacing.spanMs ?? 0;
      for (const p of (pacing.longPauses ?? []) as LongPause[]) {
        const after = turn.words[p.afterWordIndex - wordCount];
        const before = turn.words[p.beforeWordIndex - wordCount];
        pauses.push({ ms: p.durationMs, after: after?.text ?? "", before: before?.text ?? "", atMs: Math.round(clock + (after?.offsetMs ?? 0) + (after?.durationMs ?? 0)) });
      }
    } else if (tokens.length > 0) {
      allTimed = false;
    }
    wordCount += tokens.length;
    speakingMs += turn.durationMs;
    clock += turn.durationMs;
  });

  const minutes = speakingMs / 60_000;
  const wordsPerMinute = allTimed && timedSpanMs > 0 ? Math.round((timedWords / timedSpanMs) * 60_000) : minutes > 0 && wordCount > 0 ? Math.round(wordCount / minutes) : null;
  const fillerTotal = [...fillers.values()].reduce((n, c) => n + c.count, 0);
  const longestSentence = sentences.reduce<{ text: string; words: number } | null>((best, s) => (!best || s.words > best.words ? s : best), null);
  const candidates = perTurn.filter((t) => t.words >= 8 && t.density > 0);
  const weakest = [...candidates].sort((a, b) => b.density - a.density || b.words - a.words)[0];

  return {
    wordCount,
    speakingMs,
    wordsPerMinute,
    paceEstimated: !(allTimed && timedSpanMs > 0),
    longPauses: allTimed && timedSpanMs > 0 ? pauses : null,
    fillers: sorted(fillers),
    fillerTotal,
    fillersPerMinute: minutes > 0 ? Math.round((fillerTotal / minutes) * 10) / 10 : null,
    hedges: sorted(hedges),
    hedgeTotal: [...hedges.values()].reduce((n, c) => n + c.count, 0),
    immediateRepeats: sorted(repeats),
    overused: [...overuse.entries()].filter(([, n]) => n >= OVERUSED_MIN).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count),
    sentenceCount: sentences.length,
    averageSentence: sentences.length ? Math.round((sentences.reduce((n, s) => n + s.words, 0) / sentences.length) * 10) / 10 : 0,
    longestSentence,
    rambling: sentences.filter((s) => s.words > RAMBLING_WORDS).map((s) => s.text),
    turns: perTurn,
    weakestTurn: weakest ? weakest.turn : null,
  };
}

/**
 * A tighter version of an answer by rule alone: fillers and hedges out, immediate
 * repeats collapsed. Used when there is no Claude key. It cannot restructure a sentence.
 */
export function tightenByRules(text: string): string {
  const raw = splitWords(text);
  const tokens: Token[] = raw.map((w) => ({ norm: normalizeWord(w), atMs: null }));
  const drop = new Array<boolean>(raw.length).fill(false);
  const hedgeList = [...HEDGES, ...FILLERS_PHRASE].sort((a, b) => b.split(" ").length - a.split(" ").length);
  for (let i = 0; i < tokens.length; i++) {
    if (drop[i]) continue;
    const phrase = hedgeList.find((h) => h.split(" ").every((part, k) => tokens[i + k]?.norm === part && !drop[i + k]));
    if (phrase) {
      for (let k = 0; k < phrase.split(" ").length; k++) drop[i + k] = true;
      continue;
    }
    const token = tokens[i] as Token;
    const previous = tokens[i - 1]?.norm;
    if (FILLERS_SINGLE.has(token.norm) || (token.norm === "like" && (i === 0 || (previous !== undefined && LIKE_AFTER.has(previous))))) drop[i] = true;
    else if (i > 0 && token.norm === previous && !drop[i - 1]) drop[i] = true;
  }
  // Rebuild, tidying the punctuation a removed phrase leaves behind.
  const kept: string[] = [];
  let runHadComma = false;
  raw.forEach((word, i) => {
    if (!drop[i]) {
      kept.push(word);
      runHadComma = false;
      return;
    }
    if (/,$/.test(word)) runHadComma = true;
    if (drop[i + 1]) return;
    const last = kept[kept.length - 1];
    const closing = /[.!?]+$/.exec(word)?.[0];
    if (last === undefined) return;
    if (closing) kept[kept.length - 1] = last.replace(/[,;:]+$/, "") + closing;
    else if (runHadComma && /,$/.test(last)) kept[kept.length - 1] = last.slice(0, -1);
  });
  let out = kept.join(" ").replace(/\s+([,.!?;:])/g, "$1").replace(/^[,;:\s]+/, "").trim();
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
  return out;
}
