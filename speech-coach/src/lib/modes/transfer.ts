import { EMPTY_MODES, type ModesData } from "./types";

/** Export and import for the coaching modes. Older export files have no `modes` block and import as before. */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function list<T extends { id: string }>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((v) => isRecord(v) && typeof v.id === "string") as T[]) : [];
}

export function parseModesImport(json: string): ModesData | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const modes = isRecord(data) ? data.modes : null;
  if (!isRecord(modes)) return null;
  const settings = isRecord(modes.settings) ? modes.settings : {};
  return {
    version: 1,
    scans: list(modes.scans),
    talks: list(modes.talks),
    overrides: list(modes.overrides),
    thumbs: list(modes.thumbs),
    words: list(modes.words),
    events: list(modes.events),
    shadows: list(modes.shadows),
    settings: { spanishHints: settings.spanishHints === true },
  };
}

function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const ids = new Set(existing.map((e) => e.id));
  return [...existing, ...incoming.filter((i) => !ids.has(i.id))];
}

/** Merge an import into what is here. Existing entries and my current settings win. */
export function mergeModes(current: ModesData, incoming: ModesData): ModesData {
  const haveWords = new Set(current.words.map((w) => w.word));
  return {
    version: 1,
    scans: mergeById(current.scans, incoming.scans),
    talks: mergeById(current.talks, incoming.talks),
    overrides: mergeById(current.overrides, incoming.overrides),
    thumbs: mergeById(current.thumbs, incoming.thumbs),
    words: [...current.words, ...incoming.words.filter((w) => !haveWords.has(w.word) && !current.words.some((c) => c.id === w.id))],
    events: mergeById(current.events, incoming.events),
    shadows: mergeById(current.shadows, incoming.shadows),
    settings: current.settings,
  };
}

const mine = <T extends { source: string }>(items: readonly T[]): T[] => items.filter((i) => i.source !== "demo");

/** What goes into an export file: my own data, never the sample data. */
export function exportableModes(data: ModesData): ModesData {
  return {
    ...EMPTY_MODES,
    scans: mine(data.scans),
    talks: mine(data.talks),
    overrides: data.overrides.filter((o) => !o.resultId.startsWith("demo-")),
    thumbs: data.thumbs,
    words: mine(data.words),
    events: data.events.filter((e) => !e.scriptId.startsWith("demo-")),
    shadows: mine(data.shadows),
    settings: data.settings,
  };
}
