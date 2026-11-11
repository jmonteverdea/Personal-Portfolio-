import type { SessionRecord } from "../types";
import type { DrillTake, Observation } from "./types";

/** A sound needs at least this many occurrences in a take to count as one observation. */
export const MIN_COUNT_PER_TAKE = 1;

/**
 * Every scored sighting of every sound, oldest first, grouped by sound.
 * Script takes come from the session history. Drill takes come from the learning store.
 * A script tagged "drill" counts as mixed practice, not as real speech.
 */
export function buildObservations(
  sessions: readonly SessionRecord[],
  drillTakes: readonly DrillTake[],
  drillScriptIds: ReadonlySet<string> = new Set(),
): Map<string, Observation[]> {
  const all: Observation[] = [];
  for (const s of sessions) {
    for (const [phoneme, stat] of Object.entries(s.phonemeStats)) {
      if (stat.count < MIN_COUNT_PER_TAKE) continue;
      all.push({
        phoneme,
        date: s.date,
        average: stat.sum / stat.count,
        count: stat.count,
        context: drillScriptIds.has(s.scriptId) ? "mixed" : "script",
        scriptId: s.scriptId,
      });
    }
  }
  for (const t of drillTakes) {
    for (const [phoneme, stat] of Object.entries(t.phonemeStats)) {
      if (stat.count < MIN_COUNT_PER_TAKE) continue;
      // A drill only says something reliable about the sound it targets.
      if (phoneme !== t.phoneme) continue;
      all.push({ phoneme, date: t.date, average: stat.sum / stat.count, count: stat.count, context: t.stage, scriptId: null });
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  const byPhoneme = new Map<string, Observation[]>();
  for (const o of all) {
    const list = byPhoneme.get(o.phoneme);
    if (list) list.push(o);
    else byPhoneme.set(o.phoneme, [o]);
  }
  return byPhoneme;
}

export function isRealSpeech(o: Observation): boolean {
  return o.context === "script" || o.context === "sentences";
}
