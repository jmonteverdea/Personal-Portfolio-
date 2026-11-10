import type { AssessmentResult, HistoryExport, PhonemeStat, Script, SessionRecord, WeakSound } from "./types";

/** A phoneme occurrence under this score counts as a miss. */
export const PHONEME_LOW_BELOW = 60;
/** A sound averaging under this is listed as weak. */
export const WEAK_SOUND_BELOW = 80;
/** Ignore sounds heard fewer times than this: too little evidence. */
export const MIN_OCCURRENCES = 3;

/** Per-phoneme stats for one take. */
export function phonemeStatsFor(result: AssessmentResult): Record<string, PhonemeStat> {
  const stats: Record<string, PhonemeStat> = {};
  const lowest: Record<string, { word: string; score: number }[]> = {};
  for (const word of result.words) {
    if (word.status === "omission" || word.status === "insertion") continue;
    for (const p of word.phonemes) {
      const stat = (stats[p.phoneme] ??= { count: 0, sum: 0, lowCount: 0, examples: [] });
      stat.count += 1;
      stat.sum += p.accuracy;
      if (p.accuracy < PHONEME_LOW_BELOW) stat.lowCount += 1;
      (lowest[p.phoneme] ??= []).push({ word: word.text.replace(/[^\p{L}\p{N}'-]/gu, ""), score: p.accuracy });
    }
  }
  for (const [phoneme, list] of Object.entries(lowest)) {
    const stat = stats[phoneme];
    if (!stat) continue;
    const seen = new Set<string>();
    stat.examples = list
      .sort((a, b) => a.score - b.score)
      .filter((e) => {
        const key = e.word.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((e) => e.word);
  }
  return stats;
}

/** What gets stored in localStorage for one take. */
export function summarizeSession(result: AssessmentResult): SessionRecord {
  return {
    id: result.id,
    date: result.createdAt,
    scriptId: result.scriptId,
    scriptTitle: result.scriptTitle,
    source: result.source,
    scores: result.scores,
    wordsPerMinute: result.pacing.wordsPerMinute,
    longPauseCount: result.pacing.longPauses ? result.pacing.longPauses.length : null,
    phonemeStats: phonemeStatsFor(result),
  };
}

/** Rank sounds across sessions, weakest first. */
export function aggregateWeakSounds(
  sessions: readonly SessionRecord[],
  minOccurrences = MIN_OCCURRENCES,
): WeakSound[] {
  const merged = new Map<string, WeakSound & { sum: number }>();
  const byRecency = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  for (const session of byRecency) {
    for (const [phoneme, stat] of Object.entries(session.phonemeStats)) {
      if (stat.count <= 0) continue;
      const entry =
        merged.get(phoneme) ??
        ({
          phoneme,
          averageAccuracy: 0,
          occurrences: 0,
          lowCount: 0,
          weakSessions: 0,
          sessions: 0,
          examples: [],
          sum: 0,
        } satisfies WeakSound & { sum: number });
      entry.occurrences += stat.count;
      entry.sum += stat.sum;
      entry.lowCount += stat.lowCount;
      entry.sessions += 1;
      if (stat.sum / stat.count < WEAK_SOUND_BELOW) entry.weakSessions += 1;
      for (const example of stat.examples) {
        if (entry.examples.length < 4 && !entry.examples.includes(example)) entry.examples.push(example);
      }
      merged.set(phoneme, entry);
    }
  }
  return [...merged.values()]
    .filter((e) => e.occurrences >= minOccurrences)
    .map(({ sum, ...rest }) => ({ ...rest, averageAccuracy: Math.round((sum / rest.occurrences) * 10) / 10 }))
    .sort((a, b) => a.averageAccuracy - b.averageAccuracy || b.occurrences - a.occurrences);
}

/* ---------- export / import ---------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSession(v: unknown): v is SessionRecord {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.date === "string" &&
    typeof v.scriptId === "string" &&
    typeof v.scriptTitle === "string" &&
    isRecord(v.phonemeStats) &&
    (v.scores === null || isRecord(v.scores))
  );
}

function isScript(v: unknown): v is Script {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.text === "string" &&
    Array.isArray(v.tags)
  );
}

export function buildExport(sessions: SessionRecord[], scripts: Script[], now: Date): HistoryExport {
  return { app: "speech-coach", version: 1, exportedAt: now.toISOString(), sessions, scripts };
}

/** Validate an imported file. Throws with a readable message if it is not ours. */
export function parseImport(json: string): HistoryExport {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!isRecord(data) || data.app !== "speech-coach" || !Array.isArray(data.sessions)) {
    throw new Error("That file is not a Speech Coach export.");
  }
  const sessions = data.sessions.filter(isSession);
  if (sessions.length !== data.sessions.length) {
    throw new Error("Some sessions in that file are malformed. Nothing was imported.");
  }
  const scripts = Array.isArray(data.scripts) ? data.scripts.filter(isScript) : [];
  return {
    app: "speech-coach",
    version: 1,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
    sessions,
    scripts,
  };
}

/** Merge by id. Existing entries win so an import never overwrites newer local data. */
export function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const ids = new Set(existing.map((e) => e.id));
  return [...existing, ...incoming.filter((i) => !ids.has(i.id))];
}

/**
 * Sessions to base trends and weak sounds on. Demo sessions only count while
 * there is no real history, so sample data never skews my own numbers.
 */
export function analyticsSessions(sessions: readonly SessionRecord[]): SessionRecord[] {
  const real = sessions.filter((s) => s.source !== "demo");
  return real.length > 0 ? real : [...sessions];
}
