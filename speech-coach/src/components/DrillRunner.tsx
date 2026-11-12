"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useCompare, type MineClip } from "@/hooks/useCompare";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { buildAssessmentResult, buildTranscriptResult } from "@/lib/azure/normalize";
import { guideFor } from "@/lib/coach/local";
import { simulateDrillTake } from "@/lib/fixtures/demo-learning";
import { phonemeStatsFor } from "@/lib/history";
import { stageMaterial, wordsWithSound } from "@/lib/learning/content";
import { MASTERY_NAMES, masteryLevel } from "@/lib/learning/mastery";
import { describeDue, reviewState } from "@/lib/learning/schedule";
import { learning } from "@/lib/learning/store";
import { DRILL_STAGES, type DrillStage, type Observation } from "@/lib/learning/types";
import { newId, useStore } from "@/lib/store";
import { normalizeWord } from "@/lib/text";
import type { AssessmentResult } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { band, BAND_TEXT, BAND_WORD, bare, Button, Delta, Kbd, Label, MasteryTag, Note, Sound, wordClass } from "./ds/ui";
import { ErrorState } from "./errorStates";
import { RecordControl } from "./RecordControl";
import { VoiceField } from "./voice/VoiceField";

type Step = "listen" | "speak" | "review";

interface Take {
  id: string;
  result: AssessmentResult;
  audio: Blob | null;
  /** Average of the target sound in this take. Null when there is no sound data. */
  target: number | null;
}

const STAGE_NUMERAL = ["I", "II", "III"];

function targetAverage(result: AssessmentResult, phoneme: string): number | null {
  const stat = phonemeStatsFor(result)[phoneme];
  return stat && stat.count > 0 ? stat.sum / stat.count : null;
}

/**
 * One sound, three stages: alone in minimal pairs, mixed with other sounds,
 * then in real sentences. Each stage is listen, speak, compare.
 */
export function DrillRunner({ phoneme, onDone, doneLabel = "Done" }: { phoneme: string; onDone: () => void; doneLabel?: string }) {
  const { azure } = useConfig();
  const store = useStore();
  const atlas = useAtlas();
  const reduce = useReducedMotion();
  const entry = atlas.sounds.get(phoneme);
  const [startLevel] = useState(() => entry?.level ?? 0);
  const [stageIndex, setStageIndex] = useState(0);
  const [step, setStep] = useState<Step>("listen");
  const [heardModel, setHeardModel] = useState(false);
  const [takes, setTakes] = useState<Partial<Record<DrillStage, Take[]>>>({});
  const [selected, setSelected] = useState(0);
  const [finished, setFinished] = useState(false);
  const player = useCompare();

  const stage = DRILL_STAGES[stageIndex] as DrillStage;
  const examples = useMemo(() => atlas.priorities.find((p) => p.phoneme === phoneme)?.examples ?? [], [atlas.priorities, phoneme]);
  const results = useMemo(() => Object.values(store.results), [store.results]);
  const material = useMemo(() => stageMaterial(phoneme, stage, { scripts: store.scripts, results, examples }), [phoneme, stage, store.scripts, results, examples]);
  const targets = useMemo(() => wordsWithSound(phoneme, results, examples), [phoneme, results, examples]);
  const guide = guideFor(phoneme);
  const stageTakes = takes[stage] ?? [];
  const take = stageTakes[stageTakes.length - 1] ?? null;
  const previous = stageTakes[stageTakes.length - 2] ?? null;

  const keepTake = useCallback(
    (result: AssessmentResult, audio: Blob | null) => {
      const next: Take = { id: result.id, result, audio, target: targetAverage(result, phoneme) };
      learning.addDrillTake(
        { id: result.id, date: result.createdAt, phoneme, stage, source: result.source, text: material.text, phonemeStats: phonemeStatsFor(result) },
        audio,
      );
      setTakes((all) => ({ ...all, [stage]: [...(all[stage] ?? []), next] }));
      // Open on the weakest word that carries the sound: that is the one to listen to.
      const weakest = result.words
        .filter((w) => w.status !== "insertion" && targets.has(normalizeWord(w.text)))
        .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))[0];
      setSelected(weakest?.index ?? 0);
      setStep("review");
    },
    [material.text, phoneme, stage, targets],
  );

  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (!outcome) return;
      const meta = { id: newId("drill"), createdAt: new Date().toISOString(), scriptId: `drill-${phoneme}`, scriptTitle: `Drill /${phoneme}/`, referenceText: material.text };
      keepTake(azure ? buildAssessmentResult(outcome.segments, meta) : buildTranscriptResult(outcome.transcript, outcome.durationMs, meta), outcome.audio);
    },
    [azure, keepTake, material.text, phoneme],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const recording = recorder.phase === "recording";

  const listen = useCallback(async () => {
    await player.playModel(material.text);
    setHeardModel(true);
    setStep((s) => (s === "listen" ? "speak" : s));
  }, [material.text, player]);

  const record = useCallback(() => {
    if (!heardModel) return;
    void recorder.start(material.text);
  }, [heardModel, material.text, recorder]);

  const simulate = useCallback(() => {
    keepTake(simulateDrillTake(material.text, phoneme, stage, targets, newId("drill"), new Date()), null);
  }, [keepTake, material.text, phoneme, stage, targets]);

  const retry = useCallback(() => {
    recorder.clearError();
    setStep("speak");
  }, [recorder]);

  const next = useCallback(() => {
    if (stageIndex >= DRILL_STAGES.length - 1) {
      setFinished(true);
      return;
    }
    setStageIndex((i) => i + 1);
    setStep("listen");
    setHeardModel(false);
  }, [stageIndex]);

  const word = take?.result.words.find((w) => w.index === selected) ?? null;
  const clip: MineClip | null =
    take?.audio && word && word.offsetMs !== null && word.durationMs !== null ? { blob: take.audio, offsetMs: word.offsetMs, durationMs: word.durationMs } : null;
  const spokenWords = take?.result.words.filter((w) => w.status !== "insertion") ?? [];
  const move = (by: number) => {
    const at = spokenWords.findIndex((w) => w.index === selected);
    const to = spokenWords[Math.min(spokenWords.length - 1, Math.max(0, at + by))];
    if (to) setSelected(to.index);
  };

  useHotkeys(
    finished
      ? { enter: onDone, n: onDone }
      : step === "review"
        ? {
            m: word ? () => void player.playModel(bare(word.text)) : undefined,
            p: clip ? () => void player.playMine(clip) : undefined,
            c: word && clip ? () => void player.compare(bare(word.text), clip) : undefined,
            r: retry,
            n: next,
            enter: next,
            arrowleft: () => move(-1),
            arrowright: () => move(1),
          }
        : {
            m: () => void listen(),
            space: recording ? recorder.stop : recorder.phase === "idle" && heardModel && !atlas.demoMode ? record : undefined,
            enter: atlas.demoMode && heardModel ? simulate : undefined,
          },
  );

  /* ----- summary after the third stage ----- */
  if (finished) {
    const now = new Date();
    const fresh: Observation[] = DRILL_STAGES.flatMap((s) => {
      const last = (takes[s] ?? []).at(-1);
      return last && last.target !== null ? [{ phoneme, date: last.result.createdAt, average: last.target, count: 1, context: s, scriptId: null }] : [];
    });
    const all = [...(entry?.observations ?? []).filter((o) => !fresh.some((f) => f.date === o.date)), ...fresh].sort((a, b) => a.date.localeCompare(b.date));
    const level = masteryLevel(all);
    const review = reviewState(all, now);
    return (
      <div className="mx-auto max-w-3xl">
        <Label>Review complete</Label>
        <h2 className="display mt-3 text-(length:--text-display-m)">
          <Sound>{phoneme}</Sound> across three stages.
        </h2>
        <ol className="mt-10 divide-y divide-rule border-y border-rule">
          {DRILL_STAGES.map((s, i) => {
            const last = (takes[s] ?? []).at(-1);
            const score = last?.target ?? null;
            return (
              <li key={s} className="flex items-baseline gap-5 py-4">
                <span className="label w-8 text-fg-3">{STAGE_NUMERAL[i]}</span>
                <span className="flex-1 text-base">{stageMaterial(phoneme, s).title}</span>
                {score === null ? (
                  <span className="label text-fg-3">{last ? "no sound score" : "skipped"}</span>
                ) : (
                  <span className={`font-mono tabular-nums ${BAND_TEXT[band(score)]}`}>
                    {Math.round(score)} <span className="label ml-2">{BAND_WORD[band(score)]}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-4">
          <div>
            <Label>Stage</Label>
            <div className="mt-2 flex items-center gap-3">
              <MasteryTag level={level} />
              {level !== startLevel && <span className="label text-fg-3">was {MASTERY_NAMES[startLevel]}</span>}
            </div>
          </div>
          {review && (
            <div>
              <Label>Next review</Label>
              <p className="mt-2 text-base">
                {describeDue(review, now)} <span className="text-fg-3">· every {review.intervalDays} {review.intervalDays === 1 ? "day" : "days"} for now</span>
              </p>
            </div>
          )}
        </div>
        {fresh.length === 0 && (
          <div className="mt-8">
            <Note>No sound scores were recorded, so the stage and the schedule did not move. Sound scoring needs Azure Speech.</Note>
          </div>
        )}
        <div className="mt-10">
          <Button variant="solid" size="lg" onClick={onDone} hotkey="enter">
            {doneLabel}
          </Button>
        </div>
      </div>
    );
  }

  const verdict = take?.target == null ? null : band(take.target);

  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Left: the sound and how to make it. Stays put through all three stages. */}
      <aside>
        <Label>Review</Label>
        <p className="ipa mt-2 text-[clamp(6rem,14vw,11rem)] leading-none" aria-label={`Sound ${phoneme}`}>
          {phoneme}
        </p>
        {entry && (
          <div className="mt-5">
            <MasteryTag level={entry.level} due={entry.review?.due} />
          </div>
        )}
        {guide && <p className="mt-6 max-w-md text-[0.9375rem] leading-relaxed text-fg-2">{guide.how}</p>}
        <ol className="mt-8 flex gap-2" aria-label="Stages">
          {DRILL_STAGES.map((s, i) => (
            <li key={s} className={`flex-1 border-t-2 pt-2 ${i === stageIndex ? "border-signal" : i < stageIndex ? "border-fg" : "border-rule"}`} aria-current={i === stageIndex ? "step" : undefined}>
              <span className={`label ${i === stageIndex ? "!text-fg" : "text-fg-3"}`}>
                {STAGE_NUMERAL[i]} {s === "pairs" ? "Alone" : s === "mixed" ? "Mixed" : "Sentences"}
              </span>
            </li>
          ))}
        </ol>
      </aside>

      {/* Right: listen, speak, compare. */}
      <div className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${stage}-${step === "review" ? "review" : "do"}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Label>
              Stage {STAGE_NUMERAL[stageIndex]} · {material.title}
              {material.fromMyScripts && " · from your scripts"}
            </Label>

            {step !== "review" && (
              <>
                <p className="prompter mt-5 !text-[clamp(1.6rem,1rem+2.2vw,2.75rem)]">{material.text}</p>
                {recorder.error && (
                  <div className="mt-6">
                    <ErrorState error={recorder.error} compact />
                  </div>
                )}
                <div className="relative mt-8 border-t border-rule">
                  <VoiceField stream={recorder.stream} active={recording} className="h-28" />
                  <div className="absolute inset-0 flex flex-wrap items-center gap-4">
                    <Button variant={heardModel ? "outline" : "solid"} size="lg" onClick={() => void listen()} busy={player.playing === "model"} hotkey="M" disabled={recording}>
                      {heardModel ? "Hear the model again" : "Hear the model first"}
                    </Button>
                    {atlas.demoMode ? (
                      <Button variant="solid" size="lg" onClick={simulate} disabled={!heardModel} hotkey="enter">
                        Simulate my take
                      </Button>
                    ) : (
                      <RecordControl phase={recorder.phase} onStart={record} onStop={recorder.stop} disabled={!heardModel} idleLabel="Speak" />
                    )}
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-fg-3">
                  {!heardModel
                    ? "Listen before you speak. The microphone opens after the model has played."
                    : atlas.demoMode
                      ? "Demo: no microphone is used. A sample take stands in for your voice."
                      : azure
                        ? "Say the line once, at an easy pace."
                        : "Transcript-only mode: words are checked, sounds are not scored."}
                </p>
                {player.note && <p className="mt-2 text-xs text-fg-3">{player.note}</p>}
              </>
            )}

            {step === "review" && take && (
              <>
                <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
                  {take.target !== null && verdict ? (
                    <>
                      <p className={`numeral text-[5.5rem] ${BAND_TEXT[verdict]}`}>{Math.round(take.target)}</p>
                      <div className="pb-2">
                        <p className="text-lg">
                          <Sound>{phoneme}</Sound> {verdict === "good" ? "held." : verdict === "fair" ? "is close." : "is not there yet."}
                        </p>
                        {previous?.target != null && (
                          <p className="mt-1">
                            <Delta value={take.target - previous.target} suffix=" on your last try" />
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-lg text-fg-2">Words checked. No sound score in this mode.</p>
                  )}
                </div>

                <div className="mt-7 flex flex-wrap gap-x-2 gap-y-3" role="listbox" aria-label="Words in your take">
                  {take.result.words.map((w) => {
                    const hasTarget = w.phonemes.some((p) => p.phoneme === phoneme);
                    const isSelected = w.index === selected;
                    return (
                      <button
                        key={w.index}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => setSelected(w.index)}
                        className={`press prompter !text-[1.75rem] !leading-none border-b-2 px-1.5 pb-1.5 pt-1 ${isSelected ? "border-fg bg-surface" : "border-transparent hover:border-rule-strong"} ${wordClass(w)}`}
                      >
                        {bare(w.text)}
                        {hasTarget && w.accuracy !== null && <sup className="ml-1 font-mono text-[0.625rem] not-italic tracking-normal">{Math.round(w.accuracy)}</sup>}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
                  <Button onClick={() => word && void player.playModel(bare(word.text))} busy={player.playing === "model"} hotkey="M" disabled={!word}>
                    Model
                  </Button>
                  <Button onClick={() => clip && void player.playMine(clip)} busy={player.playing === "mine"} hotkey="P" disabled={!clip}>
                    Mine
                  </Button>
                  <Button onClick={() => word && clip && void player.compare(bare(word.text), clip)} hotkey="C" disabled={!clip}>
                    A then B
                  </Button>
                  <span className="mx-1 hidden h-6 w-px bg-rule sm:block" aria-hidden />
                  <Button onClick={retry} hotkey="R">
                    Try again
                  </Button>
                  <Button variant="solid" onClick={next} hotkey="N">
                    {stageIndex >= DRILL_STAGES.length - 1 ? "Finish" : "Next stage"}
                  </Button>
                </div>
                <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd> choose a word.
                  {!clip && (
                    <span>
                      {take.result.source === "demo" ? " The sample take has no audio, so Mine and A then B are off." : " Your own audio per word needs Azure word timing."}
                    </span>
                  )}
                </p>
                {player.note && <p className="mt-2 text-xs text-fg-3">{player.note}</p>}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
