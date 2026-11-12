"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { buildAssessmentResult } from "@/lib/azure/normalize";
import { demoScanRecord } from "@/lib/fixtures/demo-modes";
import { phonemeStatsFor } from "@/lib/history";
import { CLARITY_MEANING, CLARITY_NAMES, compareScans, daysUntilRetake, mergeStats, SCAN_PARTS, summarizeScan } from "@/lib/modes/scan";
import { modes } from "@/lib/modes/store";
import { newId } from "@/lib/store";
import type { PhonemeStat } from "@/lib/types";
import { useConfig } from "../ConfigContext";
import { Button, Delta, formatDay, Label, LinkButton, Loading, Note, PageHeader, Plate, Sound, StateBlock } from "../ds/ui";
import { ErrorState } from "../errorStates";
import { RecordControl } from "../RecordControl";
import { VoiceField } from "../voice/VoiceField";

/** The four clarity levels as steps, the reached ones filled. Reads without color. */
function LevelSteps({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex gap-1.5" aria-label={`Clarity level ${level} of 4: ${CLARITY_NAMES[level]}`}>
      {([1, 2, 3, 4] as const).map((n) => (
        <li key={n} className="flex-1">
          <div className={`h-1.5 ${n <= level ? "bg-fg" : "bg-rule"}`} />
          <span className={`label mt-2 block ${n === level ? "!text-fg" : "text-fg-3"}`}>{CLARITY_NAMES[n]}</span>
        </li>
      ))}
    </ol>
  );
}

/** The scan result: a level, what is already clear, and the ranked focus sounds. */
export function ScanPage() {
  const atlas = useAtlas();
  const { azure } = useConfig();
  if (!atlas.hydrated) return <Loading label="Reading your scans" />;

  const scans = atlas.scans;
  const latest = scans[scans.length - 1];
  const previous = scans[scans.length - 2];
  const canScan = azure || atlas.demoMode;

  if (!latest) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          eyebrow="Baseline scan"
          title={
            <>
              Five minutes to find what <span className="display-italic">matters</span>.
            </>
          }
        >
          You read six short passages that touch every English sound, with extra weight on the ones Spanish speakers most often merge. The result ranks the few sounds that would make you easier to follow. The aim is clear speech. It is not to sound like someone else.
        </PageHeader>
        {canScan ? (
          <div className="flex flex-wrap items-center gap-5">
            <LinkButton href="/scan/run" variant="solid" size="lg">
              Begin the scan
            </LinkButton>
            <span className="label text-fg-3">6 passages · about 5 min{atlas.demoMode ? " · demo: simulated" : ""}</span>
          </div>
        ) : (
          <StateBlock kind="info" title="The scan needs Azure Speech." action={<LinkButton href="/" variant="quiet">Explore with sample data on Today</LinkButton>}>
            It measures each sound, and without an Azure key nothing is measured. No scores are invented. Add AZURE_SPEECH_KEY to see your own, or load the sample data to see what a result looks like.
          </StateBlock>
        )}
      </div>
    );
  }

  const summary = summarizeScan(latest.stats);
  const change = previous ? compareScans(previous, latest) : null;
  const retake = daysUntilRetake(latest, atlas.now);

  return (
    <div>
      <PageHeader
        eyebrow={`Baseline scan · ${formatDay(latest.date)}${latest.source === "demo" ? " · sample data" : ""}`}
        title={
          <>
            {CLARITY_NAMES[summary.level]}
            <span className="text-fg-3">.</span>
          </>
        }
        aside={
          canScan ? (
            <LinkButton href="/scan/run">{retake <= 0 ? "Retake the scan" : `Retake · suggested in ${retake} days`}</LinkButton>
          ) : undefined
        }
      >
        {CLARITY_MEANING[summary.level]} {summary.clear.length} of {summary.sounds} sounds are clear. Clear means a listener does not have to work for it, and that is where the app stops asking for more.
      </PageHeader>

      <div className="mb-12 max-w-2xl">
        <LevelSteps level={summary.level} />
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Plate caption="Focus sounds, in order" aside={<Label as="span">ranked by impact on being understood</Label>} flush>
          {summary.focus.length === 0 ? (
            <p className="px-5 py-8 text-fg-2 sm:px-7">Every sound in the scan is clear. There is nothing to rank.</p>
          ) : (
            <ol className="divide-y divide-rule">
              {summary.focus.slice(0, 8).map((s, i) => (
                <li key={s.phoneme}>
                  <Link href={`/sound?p=${encodeURIComponent(s.phoneme)}`} className="press group flex items-center gap-5 px-5 py-4 hover:bg-surface sm:px-7">
                    <span className="label w-5 text-fg-3">{i + 1}</span>
                    <Sound className="w-20 text-3xl">{s.phoneme}</Sound>
                    <div className="min-w-0 flex-1">
                      <div className="relative h-[3px] bg-rule">
                        <div className={`h-full ${s.average < 60 ? "bg-poor" : "bg-fair"}`} style={{ width: `${s.average}%` }} />
                        <span className="absolute -top-1 h-[11px] w-px bg-fg-3" style={{ left: "80%" }} aria-hidden />
                      </div>
                      <p className="mt-2 truncate text-xs text-fg-3">{s.examples.join(", ") || "in the scan passages"}</p>
                    </div>
                    <span className="font-mono text-sm tabular-nums text-fg-2">{Math.round(s.average)}</span>
                    <span className="label text-fg-3 group-hover:!text-signal">open →</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <p className="border-t border-rule px-5 py-3 text-xs leading-relaxed text-fg-3 sm:px-7">
            A sound that Spanish speakers commonly merge with another ranks above an equally low sound that listeners cope with easily. These sounds are now in your review queue and on the Sound Map.
          </p>
        </Plate>

        <div className="space-y-10">
          {change && (
            <section>
              <Label as="h2">Since the scan before · {formatDay(previous!.date)}</Label>
              {change.levelAfter !== change.levelBefore && (
                <p className="display mt-3 text-2xl">
                  {CLARITY_NAMES[change.levelBefore]} → {CLARITY_NAMES[change.levelAfter]}
                </p>
              )}
              {change.improved.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {change.improved.slice(0, 5).map((c) => (
                    <li key={c.phoneme} className="flex items-baseline gap-4">
                      <Sound className="w-14 text-2xl">{c.phoneme}</Sound>
                      <span className="font-mono text-sm tabular-nums text-fg-2">
                        {c.before} → {c.after}
                      </span>
                      <Delta value={c.delta} />
                      {change.nowClear.includes(c.phoneme) && <span className="label !text-good">now clear</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-fg-3">No sound moved by more than a few points.</p>
              )}
              {change.slipped.length > 0 && (
                <p className="mt-4 text-sm text-fg-3">
                  Lower this time: {change.slipped.slice(0, 3).map((c, i) => (
                    <span key={c.phoneme}>
                      {i > 0 && ", "}
                      <Sound>{c.phoneme}</Sound> {c.delta}
                    </span>
                  ))}
                  . One scan to the next can vary by a few points.
                </p>
              )}
            </section>
          )}

          <section>
            <Label as="h2">Already clear · {summary.clear.length}</Label>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {summary.clear.map((s) => (
                <Link key={s.phoneme} href={`/sound?p=${encodeURIComponent(s.phoneme)}`} className="ipa text-2xl text-good hover:text-signal" title={`${Math.round(s.average)}`}>
                  {s.phoneme}
                </Link>
              ))}
            </p>
            <p className="mt-3 text-sm text-fg-3">Nothing to do on these.</p>
          </section>

          {(latest.fluency !== null || latest.prosody !== null) && (
            <section>
              <Label as="h2">Rhythm</Label>
              <dl className="mt-3 flex gap-10">
                {latest.fluency !== null && (
                  <div>
                    <dd className="numeral text-5xl">{Math.round(latest.fluency)}</dd>
                    <dt className="label mt-2 text-fg-3">Fluency</dt>
                  </div>
                )}
                {latest.prosody !== null && (
                  <div>
                    <dd className="numeral text-5xl">{Math.round(latest.prosody)}</dd>
                    <dt className="label mt-2 text-fg-3">Stress and intonation</dt>
                  </div>
                )}
              </dl>
              <p className="mt-3 text-sm text-fg-3">
                Includes the word-stress sentences. To work on intonation, use <Link href="/speak" className="underline decoration-rule-strong underline-offset-4 hover:text-fg">shadowing</Link>.
              </p>
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <LinkButton href="/" variant="solid">
              Open today&rsquo;s session
            </LinkButton>
            <LinkButton href="/progress">See the Sound Map</LinkButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Taking the scan: one passage at a time. */
export function ScanRun() {
  const router = useRouter();
  const { azure } = useConfig();
  const atlas = useAtlas();
  const [part, setPart] = useState(0);
  const [parts, setParts] = useState<{ stats: Record<string, PhonemeStat>; accuracy: number; fluency: number; prosody: number | null }[]>([]);
  const current = SCAN_PARTS[part];

  const finishScan = useCallback(
    (all: typeof parts) => {
      const mean = (pick: (p: (typeof all)[number]) => number | null): number | null => {
        const values = all.map(pick).filter((v): v is number => v !== null);
        return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
      };
      modes.addScan({
        id: newId("scan"),
        date: new Date().toISOString(),
        source: "azure",
        stats: mergeStats(all.map((p) => p.stats)),
        accuracy: mean((p) => p.accuracy),
        fluency: mean((p) => p.fluency),
        prosody: mean((p) => p.prosody),
        parts: all.length,
      });
      router.push("/scan");
    },
    [router],
  );

  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (!outcome || !current) return;
      const result = buildAssessmentResult(outcome.segments, { id: newId("scanpart"), createdAt: new Date().toISOString(), scriptId: "baseline-scan", scriptTitle: "Baseline scan", referenceText: current.text });
      if (!result.scores) return;
      const next = [...parts, { stats: phonemeStatsFor(result), accuracy: result.scores.accuracy, fluency: result.scores.fluency, prosody: result.scores.prosody }];
      setParts(next);
      if (part >= SCAN_PARTS.length - 1) finishScan(next);
      else setPart(part + 1);
    },
    [current, finishScan, part, parts],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const recording = recorder.phase === "recording";

  const simulate = useCallback(() => {
    if (part >= SCAN_PARTS.length - 1) {
      modes.addScan(demoScanRecord(newId("scan"), new Date()));
      router.push("/scan");
    } else {
      setPart(part + 1);
    }
  }, [part, router]);

  const start = useCallback(() => {
    if (current) void recorder.start(current.text);
  }, [current, recorder]);

  useHotkeys({
    space: atlas.demoMode ? undefined : recording ? recorder.stop : recorder.phase === "idle" ? start : undefined,
    enter: atlas.demoMode ? simulate : undefined,
  });

  if (!atlas.hydrated) return <Loading label="One moment" />;
  if (!azure && !atlas.demoMode) {
    return (
      <StateBlock kind="info" title="The scan needs Azure Speech." action={<LinkButton href="/scan" variant="solid">Back</LinkButton>}>
        Without an Azure key no sound is measured, so there would be nothing true to show.
      </StateBlock>
    );
  }
  if (!current) return <Loading label="Scoring the scan" />;

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link href="/scan" className="label text-fg-3 hover:text-fg">
          ← Scan
        </Link>
        <Label as="span">
          Passage {part + 1} of {SCAN_PARTS.length} · {current.title}
        </Label>
      </div>
      <ol className="mb-10 flex gap-1.5" aria-hidden>
        {SCAN_PARTS.map((p, i) => (
          <li key={p.title} className={`h-[3px] flex-1 ${i < part ? "bg-fg" : i === part ? "bg-signal" : "bg-rule"}`} />
        ))}
      </ol>

      {recorder.error && (
        <div className="mb-8">
          <ErrorState error={recorder.error} compact />
        </div>
      )}

      <p className="prompter max-w-[32ch] flex-1 text-balance">{current.text}</p>

      <div className="relative mt-10 border-t border-rule">
        <VoiceField stream={recorder.stream} active={recording} className="h-36" />
        <div className="absolute inset-0 flex flex-wrap items-center gap-5 px-1">
          {atlas.demoMode ? (
            <Button variant="solid" size="lg" onClick={simulate} hotkey="enter">
              {part >= SCAN_PARTS.length - 1 ? "Simulate and finish" : "Simulate this passage"}
            </Button>
          ) : (
            <RecordControl phase={recorder.phase} onStart={start} onStop={recorder.stop} idleLabel="Read it aloud" />
          )}
        </div>
      </div>
      <div className="mt-4 max-w-2xl">
        <Note>
          {atlas.demoMode
            ? "Demo: no microphone is used. A sample result stands in for your voice at the end."
            : "Read at your normal pace, once. Do not restart if you slip: the scan is meant to catch what happens naturally."}
        </Note>
      </div>
    </div>
  );
}
