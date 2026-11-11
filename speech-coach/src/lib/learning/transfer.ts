import { EMPTY_LEARNING, type DrillTake, type EarAttempt, type LearningData, type RetryRecord } from "./types";

/** Export and import of the learning data. Old export files simply have none. */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const hasId = (v: unknown): v is { id: string; date: string } => isRecord(v) && typeof v.id === "string" && typeof v.date === "string";

/** Read the optional `learning` block of an export file. Returns null for old files or bad data. */
export function parseLearningImport(json: string): LearningData | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const learning = isRecord(data) ? data.learning : null;
  if (!isRecord(learning)) return null;
  return {
    version: 1,
    drillTakes: (Array.isArray(learning.drillTakes) ? learning.drillTakes : []).filter(
      (t): t is DrillTake => hasId(t) && typeof (t as Record<string, unknown>).phoneme === "string" && isRecord((t as Record<string, unknown>).phonemeStats),
    ),
    retries: (Array.isArray(learning.retries) ? learning.retries : []).filter(
      (r): r is RetryRecord => hasId(r) && typeof (r as Record<string, unknown>).resultId === "string" && Array.isArray((r as Record<string, unknown>).words),
    ),
    earAttempts: (Array.isArray(learning.earAttempts) ? learning.earAttempts : []).filter(
      (a): a is EarAttempt => hasId(a) && typeof (a as Record<string, unknown>).correct === "number",
    ),
    weeklyTarget: typeof learning.weeklyTarget === "number" ? Math.min(7, Math.max(1, Math.round(learning.weeklyTarget))) : EMPTY_LEARNING.weeklyTarget,
    session: null,
  };
}

function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const ids = new Set(existing.map((e) => e.id));
  return [...existing, ...incoming.filter((i) => !ids.has(i.id))];
}

/** Merge an import into what is already here. Existing entries win. */
export function mergeLearning(current: LearningData, incoming: LearningData): LearningData {
  return {
    ...current,
    drillTakes: mergeById(current.drillTakes, incoming.drillTakes),
    retries: mergeById(current.retries, incoming.retries),
    earAttempts: mergeById(current.earAttempts, incoming.earAttempts),
  };
}

/** What goes into an export file: my own data only, never demo data or the open session. */
export function exportableLearning(data: LearningData): LearningData {
  return {
    version: 1,
    drillTakes: data.drillTakes.filter((t) => t.source !== "demo"),
    retries: data.retries.filter((r) => r.source !== "demo"),
    earAttempts: data.earAttempts.filter((a) => a.source !== "demo"),
    weeklyTarget: data.weeklyTarget,
    session: null,
  };
}
