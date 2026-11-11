import type { SessionRecord } from "../types";
import type { Observation } from "./types";

/** Personal bests, shown as a quiet delta against the last take. */

export interface ScoreDelta {
  current: number;
  /** The take before this one. Null on a first take. */
  previous: number | null;
  /** current minus previous. */
  delta: number | null;
  /** Best of every earlier take. */
  bestBefore: number | null;
  /** True when this take beats every earlier one. Never true on a first take. */
  isBest: boolean;
}

function delta(current: number, earlier: readonly number[]): ScoreDelta {
  const previous = earlier.length ? (earlier[earlier.length - 1] as number) : null;
  const bestBefore = earlier.length ? Math.max(...earlier) : null;
  return {
    current,
    previous,
    delta: previous === null ? null : Math.round((current - previous) * 10) / 10,
    bestBefore,
    isBest: bestBefore !== null && current > bestBefore,
  };
}

/** Overall score of one take against earlier scored takes of the same script. */
export function scriptDelta(sessions: readonly SessionRecord[], sessionId: string): ScoreDelta | null {
  const take = sessions.find((s) => s.id === sessionId);
  if (!take?.scores) return null;
  const earlier = sessions
    .filter((s) => s.scriptId === take.scriptId && s.id !== take.id && s.scores && s.date < take.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => s.scores?.overall ?? 0);
  return delta(take.scores.overall, earlier);
}

/** Latest average of one sound against its earlier observations. */
export function soundDelta(observations: readonly Observation[]): ScoreDelta | null {
  const latest = observations[observations.length - 1];
  if (!latest) return null;
  return delta(
    Math.round(latest.average * 10) / 10,
    observations.slice(0, -1).map((o) => o.average),
  );
}

export interface SoundChange {
  phoneme: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * How each sound moved between one take and the take before it that also had the sound.
 * Improvements first. Changes smaller than `noise` points are left out: they are not news.
 */
export function soundChanges(sessions: readonly SessionRecord[], sessionId: string, noise = 4): { improved: SoundChange[]; slipped: SoundChange[] } {
  const take = sessions.find((s) => s.id === sessionId);
  if (!take) return { improved: [], slipped: [] };
  const earlier = sessions.filter((s) => s.id !== take.id && s.date < take.date).sort((a, b) => b.date.localeCompare(a.date));
  const changes: SoundChange[] = [];
  for (const [phoneme, stat] of Object.entries(take.phonemeStats)) {
    if (stat.count <= 0) continue;
    const prior = earlier.find((s) => (s.phonemeStats[phoneme]?.count ?? 0) > 0)?.phonemeStats[phoneme];
    if (!prior) continue;
    const before = prior.sum / prior.count;
    const after = stat.sum / stat.count;
    if (Math.abs(after - before) < noise) continue;
    changes.push({ phoneme, before: Math.round(before), after: Math.round(after), delta: Math.round(after - before) });
  }
  return {
    improved: changes.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta),
    slipped: changes.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta),
  };
}
