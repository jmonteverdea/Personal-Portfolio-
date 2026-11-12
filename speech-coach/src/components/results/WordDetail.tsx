"use client";

import Link from "next/link";
import { useCompare, type MineClip } from "@/hooks/useCompare";
import { useHotkeys } from "@/hooks/useHotkeys";
import { getTakeAudio } from "@/lib/store";
import type { AssessmentResult, WordResult } from "@/lib/types";
import { band, BAND_BG, BAND_TEXT, bare, Button, Label, Sound } from "../ds/ui";

function statusLine(word: WordResult): string {
  switch (word.status) {
    case "omission":
      return "Skipped. This word was not heard.";
    case "insertion":
      return "Added. This word is not in the script here.";
    case "mispronounced":
      return word.spoken ? `Heard as “${word.spoken}”.` : "Not clear enough to count.";
    default:
      return word.accuracy === null ? "Said. Not scored in this mode." : "Said clearly.";
  }
}

/** One word, sound by sound: the model, my own audio, and a retry, all within reach of one hand. */
export function WordDetail({
  word,
  result,
  onRetry,
  onClose,
  hotkeys,
}: {
  word: WordResult;
  result: AssessmentResult;
  onRetry: () => void;
  onClose: () => void;
  hotkeys: boolean;
}) {
  const player = useCompare();
  const audio = getTakeAudio(result.id);
  const clip: MineClip | null = audio && word.offsetMs !== null && word.durationMs !== null ? { blob: audio, offsetMs: word.offsetMs, durationMs: word.durationMs } : null;
  const text = bare(word.text);
  const canRetry = word.status !== "insertion";

  useHotkeys(
    {
      m: () => void player.playModel(text),
      p: clip ? () => void player.playMine(clip) : undefined,
      c: clip ? () => void player.compare(text, clip) : undefined,
      r: canRetry ? onRetry : undefined,
      escape: onClose,
    },
    hotkeys,
  );

  const mineOff =
    word.status === "omission"
      ? "You did not say this word, so there is nothing of yours to play."
      : result.source === "demo"
        ? "The sample take has no audio."
        : word.offsetMs === null
          ? "Your own audio per word needs Azure word timing."
          : "The recording is kept only until the page reloads.";

  return (
    <section className="ticks border border-rule bg-surface" aria-label={`Detail for ${text}`} aria-live="polite">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 pt-6 sm:px-7">
        <div>
          <Label as="h3">Word</Label>
          <p className="prompter mt-1 !text-[3rem] !leading-none">{text}</p>
          <p className="mt-3 text-sm text-fg-2">
            {statusLine(word)}
            {word.prosody?.unexpectedBreak && " There was a pause before it that should not be there."}
            {word.prosody?.missingBreak && " A pause was expected before it."}
          </p>
        </div>
        {word.accuracy !== null && word.status !== "insertion" && (
          <p className={`numeral text-[4.5rem] ${BAND_TEXT[band(word.accuracy)]}`} aria-label={`Word accuracy ${Math.round(word.accuracy)}`}>
            {Math.round(word.accuracy)}
          </p>
        )}
      </header>

      {word.phonemes.length > 0 ? (
        <ol className="mt-6 grid border-y border-rule" style={{ gridTemplateColumns: `repeat(${Math.min(word.phonemes.length, 8)}, minmax(0, 1fr))` }}>
          {word.phonemes.map((p, i) => {
            const b = band(p.accuracy);
            const top = p.alternatives[0];
            const heard = top && top.phoneme !== p.phoneme ? top.phoneme : null;
            return (
              <li key={i} className="border-r border-rule px-2 py-4 text-center last:border-r-0">
                <Link href={`/sound?p=${encodeURIComponent(p.phoneme)}`} className={`ipa press block text-4xl leading-none hover:text-signal sm:text-5xl ${b === "good" ? "" : BAND_TEXT[b]}`} title={`Open /${p.phoneme}/`}>
                  {p.phoneme}
                </Link>
                <div className="mx-auto mt-3 h-10 w-[3px] bg-rule" aria-hidden>
                  <div className={`w-full ${BAND_BG[b]}`} style={{ height: `${p.accuracy}%`, marginTop: `${100 - p.accuracy}%` }} />
                </div>
                <p className={`mt-2 font-mono text-sm tabular-nums ${BAND_TEXT[b]}`}>{Math.round(p.accuracy)}</p>
                <p className="label mt-1 !tracking-[0.06em] text-fg-3">
                  {heard ? (
                    <>
                      heard <Sound className="!text-[0.8125rem] normal-case text-signal">{heard}</Sound>
                    </>
                  ) : (
                    <span className="opacity-0">.</span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-5 border-y border-rule px-5 py-4 text-sm text-fg-3 sm:px-7">{word.status === "omission" ? "No sounds to show for a skipped word." : "No sound data. Sound scoring needs Azure Speech."}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-7">
        <Button onClick={() => void player.playModel(text)} busy={player.playing === "model"} hotkey="M">
          Model
        </Button>
        <Button onClick={() => clip && void player.playMine(clip)} busy={player.playing === "mine"} hotkey="P" disabled={!clip} title={clip ? undefined : mineOff}>
          Mine
        </Button>
        <Button onClick={() => clip && void player.compare(text, clip)} hotkey="C" disabled={!clip} title={clip ? undefined : mineOff}>
          A then B
        </Button>
        {canRetry && (
          <Button variant="solid" onClick={onRetry} hotkey="R">
            Retry this word
          </Button>
        )}
        <button type="button" onClick={onClose} className="label ml-auto text-fg-3 hover:text-fg">
          Close · esc
        </button>
      </div>
      {(!clip || player.note) && <p className="px-5 pb-5 text-xs text-fg-3 sm:px-7">{player.note ?? mineOff}</p>}
    </section>
  );
}
