import { addDays, dayKey } from "./types";

/** Weekly rhythm: which days I practised, against a target I set. A missed day is not a loss. */

export interface WeekRhythm {
  /** Monday to Sunday. */
  days: { key: string; label: string; practised: boolean; today: boolean; future: boolean }[];
  practised: number;
  target: number;
  /** Target reached. */
  met: boolean;
}

const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function weekRhythm(activityDates: readonly string[], target: number, now: Date): WeekRhythm {
  const practisedKeys = new Set(activityDates.map((d) => dayKey(d)));
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const todayKey = dayKey(now);
  const days = LABELS.map((label, i) => {
    const key = dayKey(addDays(monday, i));
    return { key, label, practised: practisedKeys.has(key), today: key === todayKey, future: key > todayKey };
  });
  const practised = days.filter((d) => d.practised).length;
  const safeTarget = Math.min(7, Math.max(1, Math.round(target)));
  return { days, practised, target: safeTarget, met: practised >= safeTarget };
}
