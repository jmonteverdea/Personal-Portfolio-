"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { scriptDelta } from "@/lib/learning/bests";
import { stepLabel } from "@/lib/learning/plan";
import { weekRhythm } from "@/lib/learning/rhythm";
import { learning, useLearning } from "@/lib/learning/store";
import { dayKey, type GuidedSession } from "@/lib/learning/types";
import { useStore } from "@/lib/store";
import { DrillRunner } from "./DrillRunner";
import { Delta, Label, LinkButton, Loading, Sound, StateBlock } from "./ds/ui";
import { EarTrainer } from "./EarTrainer";

/** Steps finished so far: the stored ones, plus a script step once a take of that script exists. */
function useDone(session: GuidedSession | null): Set<number> {
  const { sessions } = useStore();
  return useMemo(() => {
    const done = new Set(session?.done ?? []);
    session?.steps.forEach((step, i) => {
      if (step.kind === "script" && sessions.some((s) => s.scriptId === step.scriptId && s.date >= session.startedAt)) done.add(i);
    });
    return done;
  }, [session, sessions]);
}

function Rail({ session, done, current }: { session: GuidedSession; done: Set<number>; current: number }) {
  const { scripts } = useStore();
  return (
    <ol className="mb-12 flex flex-wrap gap-x-2 gap-y-3" aria-label="Session steps">
      {session.steps.map((step, i) => {
        const state = done.has(i) ? "done" : i === current ? "now" : "next";
        return (
          <li key={i} aria-current={state === "now" ? "step" : undefined} className={`min-w-28 flex-1 border-t-2 pt-2.5 ${state === "now" ? "border-signal" : state === "done" ? "border-fg" : "border-rule"}`}>
            <span className={`label block truncate ${state === "now" ? "!text-fg" : "text-fg-3"}`}>
              {state === "done" ? "✓ " : `${i + 1}. `}
              {stepLabel(step, scripts)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Complete({ session }: { session: GuidedSession }) {
  const router = useRouter();
  const atlas = useAtlas();
  const { sessions, scripts } = useStore();
  const learn = useLearning();
  const week = weekRhythm(atlas.activityDates, learn.weeklyTarget, atlas.now);
  const scriptStep = session.steps.find((s) => s.kind === "script");
  const take = scriptStep && scriptStep.kind === "script" ? [...sessions].filter((s) => s.scriptId === scriptStep.scriptId && s.date >= session.startedAt).sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  const delta = take ? scriptDelta(sessions, take.id) : null;
  const reviewed = session.steps.flatMap((s) => (s.kind === "review" ? [s.phoneme] : []));
  const ear = [...learn.earAttempts].reverse().find((a) => a.date >= session.startedAt);

  useHotkeys({ enter: () => router.push("/progress") });

  return (
    <div className="mx-auto max-w-4xl">
      <Label>Session complete</Label>
      <h1 className="display mt-3 text-(length:--text-display-m)">That is today&rsquo;s work done.</h1>
      <dl className="mt-10 divide-y divide-rule border-y border-rule">
        {reviewed.map((phoneme) => {
          const last = [...atlas.drillTakes].reverse().find((t) => t.phoneme === phoneme && t.stage === "sentences" && t.date >= session.startedAt);
          const stat = last?.phonemeStats[phoneme];
          return (
            <div key={phoneme} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
              <dt className="w-44 text-base">
                Reviewed <Sound>{phoneme}</Sound>
              </dt>
              <dd className="flex-1 text-fg-2">
                {stat && stat.count > 0 ? `${Math.round(stat.sum / stat.count)} in real sentences.` : "Three stages done."} Now {atlas.sounds.get(phoneme) ? "on the map as " : ""}
                <span className="text-fg">{atlas.sounds.get(phoneme) ? ["Unmapped", "Finding", "Shaping", "Holding", "Owned"][atlas.sounds.get(phoneme)!.level] : "recorded"}</span>.
              </dd>
            </div>
          );
        })}
        {ear && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
            <dt className="w-44 text-base">Ear training</dt>
            <dd className="flex-1 text-fg-2">
              {ear.correct} of {ear.rounds} heard right on <Sound>{ear.phoneme}</Sound>.
            </dd>
          </div>
        )}
        {take && (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
            <dt className="w-44 text-base">Script take</dt>
            <dd className="flex-1 text-fg-2">
              {scripts.find((s) => s.id === take.scriptId)?.title ?? take.scriptTitle}
              {take.scores ? `: ${Math.round(take.scores.overall)} overall. ` : ". "}
              {delta?.delta != null && <Delta value={delta.delta} suffix=" on your last take" />}
              {delta?.isBest && <span className="label ml-3 !text-good">personal best</span>}
            </dd>
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
          <dt className="w-44 text-base">This week</dt>
          <dd className="flex-1 text-fg-2">
            {week.practised} of {week.target} days{week.met ? ". Target reached." : "."}
          </dd>
        </div>
      </dl>
      <div className="mt-10 flex flex-wrap gap-3">
        <LinkButton href="/progress" variant="solid" size="lg" hotkey="enter">
          See your sound map
        </LinkButton>
        {take && (
          <LinkButton href={`/results?session=${encodeURIComponent(take.id)}`} size="lg">
            Open the take
          </LinkButton>
        )}
        <LinkButton href="/" variant="quiet" className="self-center">
          Back to today
        </LinkButton>
      </div>
    </div>
  );
}

export function SessionRunner() {
  const atlas = useAtlas();
  const { scripts } = useStore();
  const { session } = useLearning();
  const done = useDone(session);

  if (!atlas.hydrated) return <Loading label="Loading your session" />;
  if (!session || session.day !== dayKey(atlas.now)) {
    return (
      <StateBlock kind="empty" title="No session in progress." action={<LinkButton href="/" variant="solid">Plan today&rsquo;s session</LinkButton>}>
        A guided session is planned fresh each day from what is due.
      </StateBlock>
    );
  }

  const current = session.steps.findIndex((_, i) => !done.has(i));
  if (current === -1) return <Complete session={session} />;
  const step = session.steps[current]!;
  const last = current === session.steps.length - 1 || session.steps.slice(current + 1).every((_, i) => done.has(current + 1 + i));
  const finishStep = () => learning.completeStep(current);
  const nextLabel = last ? "Finish session" : "Next step";

  return (
    <div>
      <Rail session={session} done={done} current={current} />
      {step.kind === "review" && <DrillRunner key={`review-${current}`} phoneme={step.phoneme} onDone={finishStep} doneLabel={nextLabel} />}
      {step.kind === "ear" && <EarTrainer key={`ear-${current}`} phoneme={step.phoneme} onDone={finishStep} doneLabel={nextLabel} />}
      {step.kind === "script" && <ScriptStep scriptId={step.scriptId} title={scripts.find((s) => s.id === step.scriptId)?.title} onSkip={finishStep} />}
    </div>
  );
}

function ScriptStep({ scriptId, title, onSkip }: { scriptId: string; title: string | undefined; onSkip: () => void }) {
  const router = useRouter();
  const href = `/practice?script=${encodeURIComponent(scriptId)}&guided=1`;
  useHotkeys({ enter: () => router.push(href) });
  if (!title) {
    return (
      <StateBlock kind="empty" title="That script is gone." action={<LinkButton href="/" variant="solid">Back to today</LinkButton>}>
        The script planned for this step was deleted.
      </StateBlock>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Label>Now a real script</Label>
      <h2 className="display mt-3 text-(length:--text-display-m)">{title}</h2>
      <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-2">
        The drills were the warm-up. A sound only counts as yours when it holds in real sentences, so read this one as you would in the room.
      </p>
      <div className="mt-9 flex flex-wrap items-center gap-5">
        <LinkButton href={href} variant="solid" size="lg" hotkey="enter">
          Open the script
        </LinkButton>
        <button type="button" onClick={onSkip} className="label text-fg-3 underline decoration-rule-strong underline-offset-4 hover:text-fg">
          Skip for today
        </button>
      </div>
    </div>
  );
}
