import type { SessionRecord } from "../types";
import { GOOD } from "./schedule";

/**
 * Which weak sounds matter most. Ranked by how often a sound comes back weak
 * across sessions and scripts, not by the single lowest score: a sound that is
 * a little weak everywhere costs more than one that failed once.
 */

export interface SoundPriority {
  phoneme: string;
  /** Sessions in which the sound averaged under GOOD. */
  weakSessions: number;
  sessions: number;
  /** Different scripts in which it was weak. */
  weakScripts: number;
  /** Weak in the most recent session that contained it. */
  weakLatest: boolean;
  average: number;
  examples: string[];
}

export function rankByRecurrence(sessions: readonly SessionRecord[]): SoundPriority[] {
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, SoundPriority & { sum: number; count: number; scripts: Set<string> }>();
  for (const s of ordered) {
    for (const [phoneme, stat] of Object.entries(s.phonemeStats)) {
      if (stat.count <= 0) continue;
      const entry =
        map.get(phoneme) ??
        { phoneme, weakSessions: 0, sessions: 0, weakScripts: 0, weakLatest: false, average: 0, examples: [], sum: 0, count: 0, scripts: new Set<string>() };
      const weak = stat.sum / stat.count < GOOD;
      entry.sessions += 1;
      entry.sum += stat.sum;
      entry.count += stat.count;
      entry.weakLatest = weak;
      if (weak) {
        entry.weakSessions += 1;
        entry.scripts.add(s.scriptId);
        for (const word of stat.examples) {
          if (!entry.examples.includes(word)) entry.examples.unshift(word);
        }
      }
      map.set(phoneme, entry);
    }
  }
  return [...map.values()]
    .filter((e) => e.weakSessions > 0)
    .map(({ sum, count, scripts, ...rest }) => ({
      ...rest,
      weakScripts: scripts.size,
      average: Math.round((sum / count) * 10) / 10,
      examples: rest.examples.slice(0, 4),
    }))
    .sort(
      (a, b) =>
        b.weakSessions - a.weakSessions ||
        b.weakScripts - a.weakScripts ||
        Number(b.weakLatest) - Number(a.weakLatest) ||
        a.average - b.average,
    );
}
