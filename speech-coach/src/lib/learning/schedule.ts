import { addDays, daysBetween, dayKey, type Observation } from "./types";

/**
 * Spaced review. A sound joins the schedule the first time it scores under GOOD.
 * Each good review stretches the gap (1, 3, 7, 14 days). A slip shrinks it.
 * Cramming does not stretch it: a good review only counts once at least half
 * the current gap has passed.
 */

export const REVIEW_INTERVALS = [1, 3, 7, 14] as const;
export const GOOD = 80;
export const SLIP = 60;

export interface ReviewState {
  phoneme: string;
  /** Index into REVIEW_INTERVALS. */
  step: number;
  intervalDays: number;
  lastReviewed: string;
  lastAverage: number;
  dueAt: Date;
  /** Due today or overdue. */
  due: boolean;
  /** Days until due. Zero or negative when due. */
  dueInDays: number;
}

/** Null when the sound has never been weak, so it needs no schedule. */
export function reviewState(observations: readonly Observation[], now: Date): ReviewState | null {
  let scheduled = false;
  let step = 0;
  /** Date the current gap started counting from. */
  let anchor: string | null = null;
  let last: Observation | null = null;

  for (const o of observations) {
    if (!scheduled) {
      if (o.average >= GOOD) continue;
      scheduled = true;
      step = 0;
      anchor = o.date;
      last = o;
      continue;
    }
    if (o.average < SLIP) {
      step = Math.max(0, step - 1);
      anchor = o.date;
    } else if (o.average >= GOOD) {
      const waited = anchor ? daysBetween(anchor, o.date) : 0;
      if (waited >= (REVIEW_INTERVALS[step] as number) / 2) {
        step = Math.min(REVIEW_INTERVALS.length - 1, step + 1);
        anchor = o.date;
      }
    } else if (anchor && daysBetween(anchor, o.date) >= (REVIEW_INTERVALS[step] as number)) {
      // A fair review on time keeps the same gap and restarts the clock.
      anchor = o.date;
    }
    last = o;
  }

  if (!scheduled || !last || !anchor) return null;
  const intervalDays = REVIEW_INTERVALS[step] as number;
  const dueAt = addDays(anchor, intervalDays);
  const dueInDays = daysBetween(now, dueAt);
  return {
    phoneme: last.phoneme,
    step,
    intervalDays,
    lastReviewed: last.date,
    lastAverage: last.average,
    dueAt,
    due: dueInDays <= 0,
    dueInDays,
  };
}

/** Sounds due today or overdue. Most overdue first, then weakest. */
export function dueQueue(byPhoneme: ReadonlyMap<string, readonly Observation[]>, now: Date): ReviewState[] {
  const due: ReviewState[] = [];
  for (const observations of byPhoneme.values()) {
    const state = reviewState(observations, now);
    if (state?.due) due.push(state);
  }
  return due.sort((a, b) => a.dueInDays - b.dueInDays || a.lastAverage - b.lastAverage);
}

export function describeDue(state: ReviewState, now: Date): string {
  if (state.dueInDays < 0) return `due ${-state.dueInDays} ${state.dueInDays === -1 ? "day" : "days"} ago`;
  if (state.dueInDays === 0) return "due today";
  if (state.dueInDays === 1) return "due tomorrow";
  return dayKey(state.dueAt) === dayKey(now) ? "due today" : `due in ${state.dueInDays} days`;
}
