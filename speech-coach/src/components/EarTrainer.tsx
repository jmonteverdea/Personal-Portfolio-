"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { toAppError } from "@/lib/errors";
import { contentFor } from "@/lib/learning/content";
import { buildEarRounds, checkEarAnswer, seededRandom, summarizeEar, type EarRound } from "@/lib/learning/ear";
import { learning } from "@/lib/learning/store";
import { listEarVoices, speakWithVoice, browserVoices, type EarVoice } from "@/lib/learning/voices";
import { newId } from "@/lib/store";
import { useConfig } from "./ConfigContext";
import { Button, Kbd, Label, Note, Sound, Spinner, StateBlock } from "./ds/ui";

const ROUNDS = 8;
const ADVANCE_MS = 1100;

/**
 * Hear one word of a minimal pair, in one of several voices, and say which it
 * was. Right or wrong is shown at once, in words and a mark, not only in color.
 */
export function EarTrainer({ phoneme, onDone, doneLabel = "Done" }: { phoneme: string; onDone: () => void; doneLabel?: string }) {
  const { azure } = useConfig();
  const atlas = useAtlas();
  const content = contentFor(phoneme);
  const [voices, setVoices] = useState<EarVoice[] | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [rounds, setRounds] = useState<EarRound[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    let alive = true;
    void listEarVoices(azure).then((list) => {
      if (alive) setVoices(list);
    });
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [azure]);

  const round = rounds[index] ?? null;
  const answer = answers[index] ?? null;
  const started = rounds.length > 0;
  const finished = started && index >= rounds.length;

  const play = useCallback(
    async (r: EarRound, list: EarVoice[]) => {
      const voice = list[r.voice % list.length];
      if (!voice) return;
      setPlaying(true);
      setNote(null);
      try {
        await speakWithVoice(r.spoken, voice);
      } catch (e) {
        if (voice.engine === "azure") {
          // Azure failed mid-drill: carry on with the browser's voices and say so.
          const local = await browserVoices();
          if (local.length > 0) {
            setVoices(local);
            setFellBack(true);
            try {
              await speakWithVoice(r.spoken, local[r.voice % local.length] as EarVoice);
            } catch (inner) {
              setNote(toAppError(inner).message);
            }
          } else {
            setNote(toAppError(e).message);
          }
        } else {
          setNote(toAppError(e).message);
        }
      } finally {
        setPlaying(false);
      }
    },
    [],
  );

  const begin = useCallback(() => {
    if (!voices || voices.length === 0) return;
    const built = buildEarRounds(phoneme, voices.length, ROUNDS, seededRandom(Date.now()));
    setRounds(built);
    setAnswers([]);
    indexRef.current = 0;
    setIndex(0);
    setSaved(false);
    if (built[0]) void play(built[0], voices);
  }, [phoneme, play, voices]);

  const advance = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const nextIndex = indexRef.current + 1;
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    const nextRound = rounds[nextIndex];
    if (nextRound && voices) void play(nextRound, voices);
  }, [play, rounds, voices]);

  const choose = useCallback(
    (choice: string) => {
      if (!round || answer !== null || playing) return;
      setAnswers((all) => {
        const copy = [...all];
        copy[index] = choice;
        return copy;
      });
      timer.current = setTimeout(advance, ADVANCE_MS);
    },
    [advance, answer, index, playing, round],
  );

  const summary = finished ? summarizeEar(rounds, answers) : null;
  const engine = voices?.[0]?.engine ?? "browser";
  const finish = useCallback(() => {
    if (summary && !saved) {
      learning.addEarAttempt({
        id: newId("ear"),
        date: new Date().toISOString(),
        phoneme,
        rounds: summary.rounds,
        correct: summary.correct,
        engine,
        source: atlas.usingDemo ? "demo" : azure ? "azure" : "transcript",
      });
      setSaved(true);
    }
    onDone();
  }, [atlas.usingDemo, azure, engine, onDone, phoneme, saved, summary]);

  useHotkeys(
    finished
      ? { enter: finish, n: finish, r: begin }
      : started && round
        ? {
            "1": () => choose(round.options[0]),
            "2": () => choose(round.options[1]),
            arrowleft: () => choose(round.options[0]),
            arrowright: () => choose(round.options[1]),
            m: voices && !playing ? () => void play(round, voices) : undefined,
            n: answer !== null ? advance : undefined,
          }
        : { enter: begin, space: begin },
  );

  if (!content) {
    return (
      <StateBlock kind="empty" title="No ear drill for this sound yet." action={<Button variant="solid" onClick={onDone}>{doneLabel}</Button>}>
        Ear training uses minimal pairs, and there is no pair set for <Sound>{phoneme}</Sound>.
      </StateBlock>
    );
  }
  if (voices === null) {
    return (
      <div className="flex items-center gap-3 text-fg-3">
        <Spinner /> <Label as="span">Finding voices</Label>
      </div>
    );
  }
  if (voices.length === 0) {
    return (
      <StateBlock kind="silence" title="No English voice on this device." action={<Button variant="solid" onClick={onDone} hotkey="enter">Skip ear training</Button>}>
        Ear training plays words aloud. This browser has no English voice installed and Azure Speech is not connected. Add an Azure key, or try
        Chrome or Edge.
      </StateBlock>
    );
  }

  const voiceLine =
    engine === "azure"
      ? `${voices.length} Azure neural voices`
      : `${voices.length} browser ${voices.length === 1 ? "voice" : "voices"}${azure || fellBack ? " (Azure voice unavailable)" : " (no Azure key)"}`;

  /* ----- summary ----- */
  if (summary) {
    return (
      <div className="mx-auto max-w-3xl">
        <Label>Ear training complete</Label>
        <p className="mt-4 flex items-end gap-5">
          <span className="numeral text-[8rem]">{summary.correct}</span>
          <span className="display pb-3 text-3xl text-fg-2">of {summary.rounds} heard right</span>
        </p>
        {summary.missed.length > 0 ? (
          <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-2">
            You mixed up {summary.missed.map((p) => `${p.target} and ${p.contrast}`).join(", ")}. That is where to listen hardest: play the model for each before you say them.
          </p>
        ) : (
          <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-2">
            You can hear the difference between <Sound>{phoneme}</Sound> and <Sound>{content.contrastSound}</Sound> in every voice. Now it is a matter of producing it.
          </p>
        )}
        <p className="label mt-6 text-fg-3">{voiceLine}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button variant="solid" size="lg" onClick={finish} hotkey="enter">
            {doneLabel}
          </Button>
          <Button size="lg" onClick={begin} hotkey="R">
            Again
          </Button>
        </div>
      </div>
    );
  }

  /* ----- intro ----- */
  if (!started || !round) {
    return (
      <div className="mx-auto max-w-3xl">
        <Label>Ear training</Label>
        <h2 className="display mt-3 text-(length:--text-display-m)">
          Can you hear <Sound>{phoneme}</Sound> against <Sound>{content.contrastSound}</Sound>?
        </h2>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-2">
          {ROUNDS} words, in different voices. After each one, pick the word you heard. You cannot say a difference you cannot hear, so this comes
          before speaking.
        </p>
        <p className="label mt-5 text-fg-3">{voiceLine}</p>
        {engine === "browser" && voices.length < 2 && (
          <div className="mt-5">
            <Note>Only one English voice is installed here, so every round uses the same voice. Azure Speech gives four.</Note>
          </div>
        )}
        <div className="mt-9">
          <Button variant="solid" size="lg" onClick={begin} hotkey="enter">
            Start listening
          </Button>
        </div>
      </div>
    );
  }

  /* ----- a round ----- */
  const correct = answer !== null && checkEarAnswer(round, answer);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-baseline justify-between gap-4">
        <Label>
          Ear training · <Sound>{phoneme}</Sound> or <Sound>{content.contrastSound}</Sound>
        </Label>
        <Label as="span">
          {index + 1} / {rounds.length}
        </Label>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {rounds.map((r, i) => {
          const a = answers[i];
          return <span key={i} className={`h-[3px] flex-1 ${a == null ? (i === index ? "bg-fg" : "bg-rule") : checkEarAnswer(r, a) ? "bg-good" : "bg-signal"}`} />;
        })}
      </div>

      <div className="mt-12 flex items-center gap-5">
        <Button onClick={() => void play(round, voices)} busy={playing} hotkey="M" disabled={playing}>
          Play again
        </Button>
        <span className="label text-fg-3">Voice {(round.voice % voices.length) + 1}</span>
      </div>

      <p className="mt-10 text-lg text-fg-2">Which word did you hear?</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {round.options.map((option, i) => {
          const picked = answer === option;
          const isSpoken = round.spoken === option;
          const state = answer === null ? "open" : isSpoken ? "right" : picked ? "wrong" : "rest";
          return (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              disabled={answer !== null || playing}
              className={`press ticks flex items-center justify-between gap-4 border px-6 py-7 text-left disabled:cursor-default ${
                state === "right" ? "border-good bg-good-soft" : state === "wrong" ? "border-signal bg-signal-soft" : state === "rest" ? "border-rule opacity-50" : "border-rule-strong hover:border-fg hover:bg-surface"
              }`}
            >
              <span className="prompter !text-[2.5rem] !leading-none">{option}</span>
              <span className="flex items-center gap-3">
                {state === "right" && <span className="label !text-good">{picked ? "✓ Right" : "✓ It was this"}</span>}
                {state === "wrong" && <span className="label !text-signal">✕ Not this</span>}
                {state === "open" && <Kbd>{i + 1}</Kbd>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-7 min-h-12" aria-live="polite">
        {answer !== null && (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-base">
              {correct ? "Right." : `It was “${round.spoken}”.`} <span className="text-fg-3">Next word in a moment.</span>
            </p>
            <Button size="sm" onClick={advance} hotkey="N">
              Next
            </Button>
          </div>
        )}
        {note && <p className="mt-2 text-sm text-fg-3">{note}</p>}
      </div>
    </div>
  );
}
