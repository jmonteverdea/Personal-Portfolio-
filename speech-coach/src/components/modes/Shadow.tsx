"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { buildAssessmentResult } from "@/lib/azure/normalize";
import { toAppError } from "@/lib/errors";
import { demoContours } from "@/lib/fixtures/demo-modes";
import { contourOf, decodeTake, playBuffer, stopBuffer, synthesizeModel, type ModelAudio } from "@/lib/modes/modelAudio";
import { chunkSentence, compareContours, stressGaps, type Contour, type ContourComparison, type StressGap, type TimedWord } from "@/lib/modes/pitch";
import { modes } from "@/lib/modes/store";
import { MAX_TRIES, triesLeft } from "@/lib/modes/trust";
import { speakReference } from "@/lib/speech/tts";
import { newId, useStore } from "@/lib/store";
import { splitSentences } from "@/lib/text";
import { useConfig } from "../ConfigContext";
import { Button, Label, LinkButton, Loading, Note, StateBlock } from "../ds/ui";
import { ErrorState } from "../errorStates";
import { RecordControl } from "../RecordControl";
import { VoiceField } from "../voice/VoiceField";
import { ContourPlot } from "./ContourPlot";

const SPEEDS = [
  { rate: 0.75, label: "Slow" },
  { rate: 0.9, label: "Easy" },
  { rate: 1, label: "Natural" },
];

interface Take {
  key: string;
  model: Contour | null;
  mine: Contour | null;
  modelWords: TimedWord[];
  myWords: TimedWord[];
  comparison: ContourComparison | null;
  gaps: StressGap[];
  buffer: AudioBuffer | null;
}

function verdict(c: ContourComparison | null, gaps: StressGap[]): { title: string; detail: string } {
  if (!c || c.myRange === null) return { title: "Your line is drawn.", detail: "There is no model line to compare with in this mode. Look for movement: a flat line means flat intonation." };
  if (c.modelRange === null) return { title: "Your pitch moved.", detail: `About ${c.myRange} semitones from low to high.` };
  const lift = gaps.find((g) => g.gap > 0);
  if (c.flat) {
    return {
      title: "Too flat.",
      detail: `Your pitch moved ${c.myRange} semitones. The model moved ${c.modelRange}. ${lift ? `Start by going higher on “${lift.word}”: louder, longer, and up.` : "Pick the most important word and push it higher."}`,
    };
  }
  if (c.stressShifted && c.modelPeakWord && c.myPeakWord) {
    return { title: "The stress moved.", detail: `The model's highest point is “${c.modelPeakWord}”. Yours was “${c.myPeakWord}”. Put the weight on “${c.modelPeakWord}”.` };
  }
  if (lift) return { title: "Close.", detail: `The range is there. One gap left: go higher on “${lift.word}”.` };
  return { title: "That matches.", detail: `Your pitch moved ${c.myRange} semitones against the model's ${c.modelRange}, and the stress landed on the same word.` };
}

export function Shadow() {
  const router = useRouter();
  const params = useSearchParams();
  const { azure } = useConfig();
  const atlas = useAtlas();
  const { scripts } = useStore();
  const script = scripts.find((s) => s.id === params.get("script"));
  const sentences = useMemo(() => (script ? splitSentences(script.text) : []), [script]);
  const [sentenceIndex, setSentenceIndex] = useState(() => Math.max(0, Number(params.get("s") ?? 0) || 0));
  const [chunkIndex, setChunkIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [model, setModel] = useState<ModelAudio | null>(null);
  const [heard, setHeard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [tries, setTries] = useState(0);

  const sentence = sentences[Math.min(sentenceIndex, sentences.length - 1)] ?? "";
  const chunks = useMemo(() => chunkSentence(sentence), [sentence]);
  const chunk = chunks[Math.min(chunkIndex, chunks.length - 1)] ?? "";
  const demo = atlas.demoMode;
  const scriptId = script?.id ?? "";

  useEffect(() => () => stopBuffer(), []);

  const reset = useCallback(() => {
    setModel(null);
    setHeard(false);
    setTake(null);
    setTries(0);
    setNote(null);
  }, []);

  const listen = useCallback(async () => {
    if (!chunk || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (azure) {
        const audio = model ?? (await synthesizeModel(chunk, speed));
        setModel(audio);
        await playBuffer(audio.buffer);
      } else {
        // No Azure: the browser voice can be heard but not measured.
        await speakReference(chunk, false);
      }
    } catch (e) {
      setNote(toAppError(e, "The model voice could not play.").message);
    } finally {
      setHeard(true);
      setBusy(false);
    }
  }, [azure, busy, chunk, model, speed]);

  const keep = useCallback(
    (next: Take) => {
      setTake(next);
      setTries((n) => n + 1);
      if (scriptId) {
        modes.addShadow({
          id: newId("shadow"),
          date: new Date().toISOString(),
          scriptId,
          sentence: chunk,
          modelRange: next.comparison?.modelRange ?? null,
          myRange: next.comparison?.myRange ?? null,
          flat: next.comparison?.flat ?? false,
          source: demo ? "demo" : azure ? "azure" : "transcript",
        });
      }
    },
    [azure, chunk, demo, scriptId],
  );

  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (!outcome?.audio) return;
      const blob = outcome.audio;
      void (async () => {
        try {
          const buffer = await decodeTake(blob);
          const mine = contourOf(buffer);
          let myWords: TimedWord[] = [];
          if (azure && outcome.segments.length > 0) {
            const result = buildAssessmentResult(outcome.segments, { id: "shadow", createdAt: new Date().toISOString(), scriptId, scriptTitle: "", referenceText: chunk });
            myWords = result.words
              .filter((w) => w.refIndex !== null)
              .map((w) => ({ text: w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, ""), startMs: w.offsetMs ?? -1, endMs: (w.offsetMs ?? 0) + (w.durationMs ?? 0) }));
            // Timing only helps when every word was heard.
            if (myWords.some((w) => w.startMs < 0)) myWords = [];
          }
          const modelWords = model?.words ?? [];
          const aligned = myWords.length === modelWords.length ? myWords : [];
          const comparison = model ? compareContours(model.contour, mine, modelWords, aligned) : compareContours(mine, mine);
          keep({
            key: newId("take"),
            model: model?.contour ?? null,
            mine,
            modelWords,
            myWords: aligned.length ? aligned : myWords,
            comparison: model ? comparison : { ...comparison, modelRange: null, flat: false },
            gaps: model ? stressGaps(model.contour, mine, modelWords, aligned) : [],
            buffer,
          });
        } catch {
          setNote("This browser could not decode the recording, so no pitch line could be drawn.");
        }
      })();
    },
    [azure, chunk, keep, model, scriptId],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const recording = recorder.phase === "recording";

  const record = useCallback(() => {
    if (heard) void recorder.start(chunk);
  }, [chunk, heard, recorder]);

  const simulate = useCallback(() => {
    const sample = demoContours(chunk);
    keep({
      key: newId("take"),
      model: sample.model,
      mine: sample.mine,
      modelWords: sample.modelWords,
      myWords: sample.myWords,
      comparison: compareContours(sample.model, sample.mine, sample.modelWords, sample.myWords),
      gaps: stressGaps(sample.model, sample.mine, sample.modelWords, sample.myWords),
      buffer: null,
    });
  }, [chunk, keep]);

  const lastChunk = chunkIndex >= chunks.length - 1;
  const lastSentence = sentenceIndex >= sentences.length - 1;
  const next = useCallback(() => {
    reset();
    if (!lastChunk) setChunkIndex((i) => i + 1);
    else if (!lastSentence) {
      setSentenceIndex((i) => i + 1);
      setChunkIndex(0);
    } else router.push("/speak");
  }, [lastChunk, lastSentence, reset, router]);

  const again = useCallback(() => setTake(null), []);
  const capped = triesLeft(tries) === 0;
  const done = take !== null && take.comparison !== null && !take.comparison.flat && !take.comparison.stressShifted;

  useHotkeys(
    take
      ? { n: next, enter: next, r: capped || done ? undefined : again, m: () => void listen(), p: take.buffer ? () => void playBuffer(take.buffer as AudioBuffer) : undefined }
      : {
          m: () => void listen(),
          space: demo ? undefined : recording ? recorder.stop : recorder.phase === "idle" && heard ? record : undefined,
          enter: demo && heard ? simulate : undefined,
          "1": () => { setSpeed(0.75); setModel(null); },
          "2": () => { setSpeed(0.9); setModel(null); },
          "3": () => { setSpeed(1); setModel(null); },
        },
  );

  if (!atlas.hydrated) return <Loading label="One moment" />;
  if (!script || sentences.length === 0) {
    return (
      <StateBlock kind="empty" title="No script to shadow." action={<LinkButton href="/speak" variant="solid">Pick a script</LinkButton>}>
        Shadowing uses sentences from your own scripts.
      </StateBlock>
    );
  }

  const v = take ? verdict(take.comparison, take.gaps) : null;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link href="/speak" className="label text-fg-3 hover:text-fg">
          ← Speak
        </Link>
        <Label as="span">Shadowing · {script.title}</Label>
        <Label as="span" className="ml-auto">
          sentence {sentenceIndex + 1} of {sentences.length} · part {chunkIndex + 1} of {chunks.length}
        </Label>
      </div>

      <p className="prompter !text-[clamp(1.5rem,1rem+2.1vw,2.75rem)] max-w-[30ch]">
        {chunks.map((c, i) => (
          <span key={i} className={i === chunkIndex ? "text-fg" : "text-fg-3/50"}>
            {c}{" "}
          </span>
        ))}
      </p>

      {recorder.error && (
        <div className="mt-6">
          <ErrorState error={recorder.error} compact />
        </div>
      )}

      {take && v ? (
        <section className="mt-10" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
            <div>
              <h2 className="display text-(length:--text-display-s)">{v.title}</h2>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-fg-2">{v.detail}</p>
            </div>
            <p className="flex gap-6">
              {take.model && (
                <span className="label inline-flex items-center gap-2 !text-model">
                  <span className="h-[3px] w-6 bg-model" aria-hidden /> model{take.comparison?.modelRange != null && ` · ${take.comparison.modelRange} st`}
                </span>
              )}
              <span className="label inline-flex items-center gap-2 !text-signal">
                <span className="h-[3px] w-6 bg-signal" aria-hidden /> you{take.comparison?.myRange != null && ` · ${take.comparison.myRange} st`}
              </span>
            </p>
          </div>
          <div className="mt-6 overflow-x-auto border-y border-rule py-4" data-lenis-prevent>
            <div className="min-w-[620px]">
              <ContourPlot model={take.model} mine={take.mine} modelWords={take.modelWords} myWords={take.myWords} gaps={take.gaps} animateKey={take.key} />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => void listen()} busy={busy} hotkey="M">
              Model
            </Button>
            <Button onClick={() => take.buffer && void playBuffer(take.buffer)} disabled={!take.buffer} hotkey="P">
              Mine
            </Button>
            <span className="mx-1 hidden h-6 w-px bg-rule sm:block" aria-hidden />
            {!done && !capped && (
              <Button onClick={again} hotkey="R">
                Try again · {triesLeft(tries)} left
              </Button>
            )}
            <Button variant="solid" onClick={next} hotkey="N">
              {lastChunk && lastSentence ? "Finish" : lastChunk ? "Next sentence" : "Next part"}
            </Button>
          </div>
          <p className="mt-4 text-xs text-fg-3">
            {done
              ? "Clear enough. There is nothing more to chase on this part."
              : capped
                ? `${MAX_TRIES} tries is enough for now. Move on: it will feel easier next time you meet it.`
                : !take.buffer
                  ? "Demo: sample contours. No audio was recorded, so Mine is off."
                  : take.myWords.length === 0 && take.model
                    ? "Your words could not be timed one by one this take, so the two lines are matched by overall length."
                    : ""}
          </p>
        </section>
      ) : (
        <section className="mt-10">
          <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Label as="span">Model speed</Label>
            <div className="flex" role="group" aria-label="Model speed">
              {SPEEDS.map((s, i) => (
                <button
                  key={s.rate}
                  type="button"
                  aria-pressed={speed === s.rate}
                  disabled={!azure && !demo}
                  onClick={() => {
                    setSpeed(s.rate);
                    setModel(null);
                  }}
                  className={`label press border px-3 py-2 disabled:opacity-40 ${i > 0 ? "-ml-px" : ""} ${speed === s.rate ? "border-fg bg-fg !text-bg" : "border-rule-strong text-fg-2 hover:border-fg"}`}
                >
                  {s.label} · {i + 1}
                </button>
              ))}
            </div>
            {!azure && !demo && <span className="text-xs text-fg-3">Speed control needs the Azure voice.</span>}
          </div>
          <div className="relative border-t border-rule">
            <VoiceField stream={recorder.stream} active={recording} className="h-32" />
            <div className="absolute inset-0 flex flex-wrap items-center gap-4 px-1">
              <Button variant={heard ? "outline" : "solid"} size="lg" onClick={() => void listen()} busy={busy} disabled={recording} hotkey="M">
                {heard ? "Hear it again" : "Hear the model"}
              </Button>
              {demo ? (
                <Button variant="solid" size="lg" onClick={simulate} disabled={!heard} hotkey="enter">
                  Simulate my repeat
                </Button>
              ) : (
                <RecordControl phase={recorder.phase} onStart={record} onStop={recorder.stop} disabled={!heard} idleLabel="Repeat it" />
              )}
            </div>
          </div>
          <div className="mt-4 max-w-2xl">
            <Note>
              {!heard
                ? "Listen, then say it straight after, copying the tune as much as the words."
                : demo
                  ? "Demo: no microphone is used. Sample pitch lines stand in for yours."
                  : azure
                    ? "Say it right after the model, at the same speed. Exaggerate the rise and fall: it will feel like too much and sound about right."
                    : "Without Azure the model's pitch cannot be measured, so only your own line is drawn."}
            </Note>
          </div>
          {note && <p className="mt-3 text-xs text-fg-3">{note}</p>}
        </section>
      )}
    </div>
  );
}
