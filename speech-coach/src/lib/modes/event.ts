import { addDays, dayKey, daysBetween } from "../learning/types";
import { normalizeWord, splitSentences, splitWords } from "../text";
import type { SpeakingEvent } from "./types";

/**
 * Event mode: a short daily rehearsal plan from today up to a named event.
 * Early days find and drill the risky words, the middle days shadow the hard
 * sentences, the last days are full run-throughs at a target pace.
 */

/** Clear work speech sits around here. The plan aims run-throughs at this band. */
export const PACE_TARGET = { min: 130, max: 160, aim: 145 };
/** Plans are built for at most this many days. Further out, the plan starts later. */
export const MAX_PLAN_DAYS = 14;

export type EventTaskKind = "read" | "words" | "shadow" | "run";

export interface EventTask {
  id: string;
  kind: EventTaskKind;
  title: string;
  detail: string;
}

export interface EventDay {
  day: string;
  /** Days left until the event. 0 is the day itself. */
  daysLeft: number;
  focus: string;
  tasks: EventTask[];
}

export interface EventPlanInput {
  eventDay: string;
  today: Date;
  scriptText: string;
  /** Normalized words I am known to find hard: words holding my weak sounds, plus my saved words. */
  hardWords: ReadonlySet<string>;
}

export interface EventPlan {
  days: EventDay[];
  riskyWords: string[];
  hardSentences: string[];
  /** Seconds the script should take at the target pace. */
  targetSeconds: number;
  wordCount: number;
}

/** Words of this script that are in my hard-word set, in script order, each once. */
export function riskyWordsIn(scriptText: string, hardWords: ReadonlySet<string>, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of splitWords(scriptText)) {
    const word = normalizeWord(raw);
    if (hardWords.has(word) && !seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
  }
  return out.slice(0, max);
}

/** The sentences with the most risky words, hardest first. Falls back to the longest sentences. */
export function hardSentencesIn(scriptText: string, risky: readonly string[], max = 3): string[] {
  const riskySet = new Set(risky);
  const scored = splitSentences(scriptText).map((sentence, order) => {
    const words = splitWords(sentence).map(normalizeWord);
    return { sentence, order, hits: words.filter((w) => riskySet.has(w)).length, length: words.length };
  });
  return scored
    .filter((s) => s.length >= 4)
    .sort((a, b) => b.hits - a.hits || b.length - a.length || a.order - b.order)
    .slice(0, max)
    .map((s) => s.sentence);
}

function describeDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
}

export function buildEventPlan({ eventDay, today, scriptText, hardWords }: EventPlanInput): EventPlan {
  const wordCount = splitWords(scriptText).length;
  const targetSeconds = Math.round((wordCount / PACE_TARGET.aim) * 60);
  const risky = riskyWordsIn(scriptText, hardWords);
  const hard = hardSentencesIn(scriptText, risky);
  const until = daysBetween(today, eventDay);
  const plan: EventPlan = { days: [], riskyWords: risky, hardSentences: hard, targetSeconds, wordCount };
  if (until < 0) return plan;

  const start = Math.max(0, until - (MAX_PLAN_DAYS - 1));
  const pace = `Aim for about ${describeDuration(targetSeconds)}, which is ${PACE_TARGET.min} to ${PACE_TARGET.max} words a minute.`;
  const wordsDetail = risky.length ? `${risky.slice(0, 6).join(", ")}${risky.length > 6 ? ` and ${risky.length - 6} more` : ""}.` : "No risky words found in this script yet. Drill your saved words instead.";
  const shadowDetail = hard[0] ? `Start with: “${hard[0]}”` : "Shadow the sentences that feel least natural.";

  for (let offset = start; offset <= until; offset++) {
    const left = until - offset;
    const day = dayKey(addDays(today, offset));
    const id = (kind: EventTaskKind, n = 1) => `${day}:${kind}:${n}`;
    let focus: string;
    let tasks: EventTask[];
    if (left === 0) {
      focus = "The day";
      tasks = [{ id: id("run"), kind: "run", title: "One warm-up run, then stop", detail: `Read it through once at speaking pace. ${pace} Do not drill today.` }];
    } else if (left <= 2) {
      focus = "Full run-throughs";
      tasks = [
        { id: id("run", 1), kind: "run", title: "Run-through, start to finish", detail: pace },
        { id: id("run", 2), kind: "run", title: "Second run-through", detail: "Same pace. Fix only what tripped you in the first one." },
      ];
    } else {
      // Rotate so each kind of work comes round, and the first day always reads the script once.
      const first = offset === start;
      const turn = (offset - start) % 3;
      if (first) {
        focus = "Find the risky words";
        tasks = [
          { id: id("read"), kind: "read", title: "Read it once for a baseline", detail: "One take, no stopping. This shows which words and sentences need work." },
          { id: id("words"), kind: "words", title: "Drill the risky words", detail: wordsDetail },
        ];
      } else if (turn === 1) {
        focus = "Words and hard sentences";
        tasks = [
          { id: id("words"), kind: "words", title: "Drill the risky words", detail: wordsDetail },
          { id: id("shadow"), kind: "shadow", title: "Shadow the hard sentences", detail: shadowDetail },
        ];
      } else if (turn === 2) {
        focus = "Intonation, then a run";
        tasks = [
          { id: id("shadow"), kind: "shadow", title: "Shadow the hard sentences", detail: shadowDetail },
          { id: id("run"), kind: "run", title: "One run-through", detail: pace },
        ];
      } else {
        focus = "Words, then a run";
        tasks = [
          { id: id("words"), kind: "words", title: "Drill the risky words", detail: wordsDetail },
          { id: id("run"), kind: "run", title: "One run-through", detail: pace },
        ];
      }
    }
    plan.days.push({ day, daysLeft: left, focus, tasks });
  }
  return plan;
}

/** The next event that has not passed. Events on the same day as today still count. */
export function activeEvent(events: readonly SpeakingEvent[], today: Date): SpeakingEvent | null {
  const todayKey = dayKey(today);
  return [...events].filter((e) => e.day >= todayKey).sort((a, b) => a.day.localeCompare(b.day))[0] ?? null;
}

export function describeCountdown(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}
