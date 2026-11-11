import type { Script, SessionRecord } from "../types";
import { hasPairs } from "./content";
import type { SoundPriority } from "./priority";
import type { ReviewState } from "./schedule";
import type { SessionStep } from "./types";

/**
 * Today's guided session. One focus at a time: sounds due for review first,
 * an ear drill for the first of them, then one real work script.
 */

export const MAX_REVIEWS_PER_SESSION = 2;

export interface PlanInput {
  due: readonly ReviewState[];
  priorities: readonly SoundPriority[];
  scripts: readonly Script[];
  sessions: readonly SessionRecord[];
}

/** The work script practised least recently. Never-practised scripts come first. */
export function nextScript(scripts: readonly Script[], sessions: readonly SessionRecord[]): Script | null {
  const work = scripts.filter((s) => !s.tags.includes("drill"));
  if (work.length === 0) return null;
  const lastPractised = (id: string): string =>
    sessions.filter((s) => s.scriptId === id).reduce((latest, s) => (s.date > latest ? s.date : latest), "");
  return [...work].sort((a, b) => lastPractised(a.id).localeCompare(lastPractised(b.id)) || a.createdAt.localeCompare(b.createdAt))[0] ?? null;
}

export function planSession({ due, priorities, scripts, sessions }: PlanInput): SessionStep[] {
  const steps: SessionStep[] = [];
  // Among due sounds, the ones that recur most go first.
  const rank = new Map(priorities.map((p, i) => [p.phoneme, i]));
  const ordered = [...due].sort((a, b) => (rank.get(a.phoneme) ?? 999) - (rank.get(b.phoneme) ?? 999));
  const reviews = ordered.slice(0, MAX_REVIEWS_PER_SESSION);
  for (const r of reviews) steps.push({ kind: "review", phoneme: r.phoneme });

  // Train the ear on the first sound being reviewed, or on the top weak sound when nothing is due.
  const earSound = [...reviews.map((r) => r.phoneme), ...priorities.map((p) => p.phoneme)].find(hasPairs);
  if (earSound) steps.push({ kind: "ear", phoneme: earSound });

  const script = nextScript(scripts, sessions);
  if (script) steps.push({ kind: "script", scriptId: script.id });
  return steps;
}

export function stepLabel(step: SessionStep, scripts: readonly Script[]): string {
  if (step.kind === "review") return `Review /${step.phoneme}/`;
  if (step.kind === "ear") return `Ear training /${step.phoneme}/`;
  return scripts.find((s) => s.id === step.scriptId)?.title ?? "Script take";
}

/** Rough minutes, so the session card can say how long this will take. */
export function estimateMinutes(steps: readonly SessionStep[]): number {
  const minutes = steps.reduce((sum, s) => sum + (s.kind === "review" ? 3 : s.kind === "ear" ? 1.5 : 3), 0);
  return Math.max(1, Math.round(minutes));
}
