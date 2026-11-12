"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { DEMO_RESULT_ID } from "@/lib/fixtures/demo";
import { demoEarlierScan } from "@/lib/fixtures/demo-modes";
import { CLARITY_NAMES, daysUntilRetake, summarizeScan } from "@/lib/modes/scan";
import { modes } from "@/lib/modes/store";
import { modeDescription } from "@/lib/mode";
import { estimateMinutes, planSession, stepLabel } from "@/lib/learning/plan";
import { weekRhythm } from "@/lib/learning/rhythm";
import { describeDue } from "@/lib/learning/schedule";
import { learning, useLearning } from "@/lib/learning/store";
import { dayKey, type SessionStep } from "@/lib/learning/types";
import { actions, newId, useStore } from "@/lib/store";
import { useConfig } from "./ConfigContext";
import { Button, Label, LinkButton, Loading, MasteryGlyph, Note, Sound } from "./ds/ui";

const NUMERALS = ["I", "II", "III", "IV", "V"];

function stepDetail(step: SessionStep): string {
  if (step.kind === "review") return "Listen, speak, compare. Alone, mixed, then in your own sentences.";
  if (step.kind === "ear") return "Eight words in different voices. Pick the one you heard.";
  return "One real take, scored, with the one thing to fix next.";
}

/** The headline is the plan, said as a sentence. */
function Headline({ steps, title }: { steps: SessionStep[]; title: string | null }) {
  const sounds = steps.flatMap((s) => (s.kind === "review" ? [s.phoneme] : []));
  if (sounds.length === 0 && title) {
    return (
      <>
        Today: one take of <span className="display-italic">{title}</span>.
      </>
    );
  }
  return (
    <>
      Today:{" "}
      {sounds.map((p, i) => (
        <span key={p}>
          {i > 0 && (i === sounds.length - 1 ? " and " : ", ")}
          <Sound className="text-signal">{p}</Sound>
        </span>
      ))}
      {title ? (
        <>
          , then <span className="display-italic">{title}</span>.
        </>
      ) : (
        "."
      )}
    </>
  );
}

function Rhythm() {
  const atlas = useAtlas();
  const { weeklyTarget } = useLearning();
  const week = weekRhythm(atlas.activityDates, weeklyTarget, atlas.now);
  return (
    <section aria-label="This week">
      <div className="flex items-baseline justify-between gap-4">
        <Label as="h2">This week</Label>
        <span className="font-mono text-sm tabular-nums text-fg-2">
          {week.practised} / {week.target} days{week.met ? " · target reached" : ""}
        </span>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {week.days.map((d) => (
          <li key={d.key} className="text-center" aria-label={`${d.label}: ${d.practised ? "practised" : d.future ? "ahead" : d.today ? "today" : "rest"}`}>
            <div className={`mx-auto flex aspect-square max-w-12 items-center justify-center rounded-full border ${d.practised ? "border-fg bg-fg text-bg" : d.today ? "border-fg" : "border-rule"}`}>
              {d.practised && <span aria-hidden>✓</span>}
            </div>
            <span className={`label mt-2 block ${d.today ? "!text-fg" : "text-fg-3"}`}>{d.label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex items-center gap-3 text-sm text-fg-2">
        <span>Target</span>
        <div className="flex items-center border border-rule">
          <button type="button" onClick={() => learning.setWeeklyTarget(week.target - 1)} disabled={week.target <= 1} aria-label="Lower weekly target" className="press h-8 w-8 hover:bg-surface disabled:opacity-30">
            −
          </button>
          <span className="w-16 text-center font-mono text-sm tabular-nums" aria-live="polite">
            {week.target} {week.target === 1 ? "day" : "days"}
          </span>
          <button type="button" onClick={() => learning.setWeeklyTarget(week.target + 1)} disabled={week.target >= 7} aria-label="Raise weekly target" className="press h-8 w-8 hover:bg-surface disabled:opacity-30">
            +
          </button>
        </div>
      </div>
    </section>
  );
}

export function Today() {
  const router = useRouter();
  const config = useConfig();
  const atlas = useAtlas();
  const { scripts, sessions: allSessions } = useStore();
  const { session } = useLearning();

  const plan = useMemo(
    () => planSession({ due: atlas.due, priorities: atlas.priorities, scripts: atlas.usingDemo ? scripts : scripts.filter((s) => !s.id.startsWith("demo-")), sessions: atlas.sessions }),
    [atlas.due, atlas.priorities, atlas.sessions, atlas.usingDemo, scripts],
  );

  const today = dayKey(atlas.now);
  const open = session && session.day === today ? session : null;
  const doneCount = open
    ? open.steps.filter((step, i) => open.done.includes(i) || (step.kind === "script" && allSessions.some((s) => s.scriptId === step.scriptId && s.date >= open.startedAt))).length
    : 0;
  const complete = open !== null && doneCount >= open.steps.length;
  const steps = open ? open.steps : plan;
  const scriptStep = steps.find((s) => s.kind === "script");
  const scriptTitle = scriptStep && scriptStep.kind === "script" ? scripts.find((s) => s.id === scriptStep.scriptId)?.title ?? null : null;
  const firstRun = atlas.sessions.length === 0;

  const begin = () => {
    if (!open || complete) {
      learning.setSession({ id: newId("session"), day: today, startedAt: new Date().toISOString(), steps: plan, done: [], source: atlas.usingDemo ? "demo" : config.azure ? "azure" : "transcript" });
    }
    router.push("/session");
  };
  const loadSample = () => {
    actions.loadDemo();
    modes.seedScans([demoEarlierScan()]);
  };
  const latestScan = atlas.scans[atlas.scans.length - 1];
  const canScan = config.azure || atlas.demoMode;

  useHotkeys({ enter: atlas.hydrated && steps.length > 0 && !complete ? begin : undefined });

  if (!atlas.hydrated) return <Loading label="Reading your history" />;

  return (
    <div className="grid gap-x-16 gap-y-14 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <div>
        <Label className="rise">
          {atlas.now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {atlas.usingDemo && " · sample data"}
        </Label>

        {complete ? (
          <>
            <h1 className="display rise mt-4 text-(length:--text-display-l)" style={{ "--i": 1 } as React.CSSProperties}>
              Done for <span className="display-italic">today</span>.
            </h1>
            <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-fg-2" style={{ "--i": 2 } as React.CSSProperties}>
              The next review is scheduled. Sleep does part of the work, so there is nothing to gain from repeating it now.
            </p>
            <div className="rise mt-9 flex flex-wrap items-center gap-5" style={{ "--i": 3 } as React.CSSProperties}>
              <LinkButton href="/progress" variant="solid" size="lg">
                See your sound map
              </LinkButton>
              <Button variant="quiet" onClick={begin}>
                Plan another session anyway
              </Button>
            </div>
          </>
        ) : steps.length === 0 ? (
          <>
            <h1 className="display rise mt-4 text-(length:--text-display-l)" style={{ "--i": 1 } as React.CSSProperties}>
              Write what you need to <span className="display-italic">say</span>.
            </h1>
            <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-fg-2" style={{ "--i": 2 } as React.CSSProperties}>
              There is no script to practise yet. Add a meeting update, a presentation opening or a hard conversation, and the first session plans itself.
            </p>
            <div className="rise mt-9" style={{ "--i": 3 } as React.CSSProperties}>
              <LinkButton href="/scripts" variant="solid" size="lg">
                Add a script
              </LinkButton>
            </div>
          </>
        ) : (
          <>
            <h1 className="display rise mt-4 text-(length:--text-display-l)" style={{ "--i": 1 } as React.CSSProperties}>
              {firstRun ? (
                <>
                  Start with one <span className="display-italic">baseline</span> take.
                </>
              ) : (
                <Headline steps={steps} title={scriptTitle} />
              )}
            </h1>
            {firstRun && (
              <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-fg-2" style={{ "--i": 2 } as React.CSSProperties}>
                Read <span className="text-fg">{scriptTitle}</span> once. From that take the app finds the sounds that cost you most and builds every later session around them.
              </p>
            )}

            <ol className="rise mt-12 border-t border-rule" style={{ "--i": 2 } as React.CSSProperties}>
              {steps.map((step, i) => {
                const isDone = open ? open.done.includes(i) || (step.kind === "script" && allSessions.some((s) => s.scriptId === step.scriptId && s.date >= open.startedAt)) : false;
                const due = step.kind === "review" ? atlas.due.find((d) => d.phoneme === step.phoneme) : undefined;
                const entry = step.kind !== "script" ? atlas.sounds.get(step.phoneme) : undefined;
                return (
                  <li key={i} className={`flex items-center gap-5 border-b border-rule py-5 ${isDone ? "text-fg-3" : ""}`}>
                    <span className="label w-7 shrink-0 text-fg-3">{isDone ? "✓" : NUMERALS[i]}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xl ${isDone ? "line-through decoration-rule-strong" : ""}`}>{stepLabel(step, scripts)}</p>
                      <p className="mt-1 text-sm text-fg-3">
                        {stepDetail(step)}
                        {due && ` Review ${describeDue(due, atlas.now)}.`}
                      </p>
                    </div>
                    {entry && <MasteryGlyph level={entry.level} due={Boolean(due)} />}
                  </li>
                );
              })}
            </ol>

            <div className="rise mt-9 flex flex-wrap items-center gap-x-6 gap-y-4" style={{ "--i": 3 } as React.CSSProperties}>
              <Button variant="solid" size="lg" onClick={begin} hotkey="enter">
                {open && doneCount > 0 ? `Continue · step ${doneCount + 1} of ${steps.length}` : firstRun ? "Begin" : "Begin session"}
              </Button>
              <span className="label text-fg-3">about {estimateMinutes(steps.filter((_, i) => !(open?.done.includes(i) ?? false)))} min</span>
            </div>
          </>
        )}

        {firstRun && (
          <div className="rise mt-14 max-w-xl" style={{ "--i": 4 } as React.CSSProperties}>
            <Note>
              No keys and nothing recorded yet?{" "}
              <button type="button" onClick={loadSample} className="font-medium text-fg underline decoration-signal underline-offset-4 hover:text-signal">
                Explore with sample data
              </button>{" "}
              to walk a whole session, results and the sound map with nothing set up.
            </Note>
          </div>
        )}
      </div>

      <aside className="rise space-y-12 lg:border-l lg:border-rule lg:pl-12" style={{ "--i": 3 } as React.CSSProperties}>
        <Rhythm />
        {atlas.due.length > 0 && (
          <section aria-label="Due today">
            <Label as="h2">Due for review · {atlas.due.length}</Label>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
              {atlas.due.slice(0, 8).map((d) => (
                <li key={d.phoneme}>
                  <Link href={`/sound?p=${encodeURIComponent(d.phoneme)}`} className="press inline-flex items-center gap-2 hover:text-signal">
                    <MasteryGlyph level={atlas.sounds.get(d.phoneme)?.level ?? 0} size={20} />
                    <Sound className="text-2xl">{d.phoneme}</Sound>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-fg-3">The session takes the two that recur most. The rest wait their turn.</p>
          </section>
        )}
        {(latestScan || canScan) && (
          <section aria-label="Baseline scan">
            <Label as="h2">Baseline scan</Label>
            {latestScan ? (
              <p className="mt-3 text-sm leading-relaxed text-fg-2">
                <Link href="/scan" className="text-fg underline decoration-rule-strong underline-offset-4 hover:decoration-signal">
                  {CLARITY_NAMES[summarizeScan(latestScan.stats).level]}
                </Link>
                {daysUntilRetake(latestScan, atlas.now) <= 0 ? ". A month has passed: time for a retake." : `. Retake suggested in ${daysUntilRetake(latestScan, atlas.now)} days.`}
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-fg-2">
                Not taken yet.{" "}
                <Link href="/scan" className="text-fg underline decoration-signal underline-offset-4 hover:text-signal">
                  Five minutes to rank the sounds that matter most
                </Link>
                .
              </p>
            )}
          </section>
        )}
        <section>
          <Label as="h2">Mode</Label>
          <p className="mt-3 text-sm leading-relaxed text-fg-2">{modeDescription(config)}</p>
          {atlas.usingDemo && (
            <p className="mt-3 text-sm leading-relaxed text-fg-2">
              Sample data is loaded.{" "}
              <Link href={`/results?session=${DEMO_RESULT_ID}`} className="underline decoration-rule-strong underline-offset-4 hover:text-fg">
                Open the sample take
              </Link>
              {" or "}
              <button
                type="button"
                onClick={() => {
                  actions.removeDemo();
                  learning.removeDemo();
                  modes.removeDemo();
                }}
                className="underline decoration-rule-strong underline-offset-4 hover:text-fg"
              >
                remove it
              </button>
              .
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
