"use client";

import { useEffect, useMemo, useState } from "react";
import { contentFor, wordsWithSound } from "@/lib/learning/content";
import { listEarVoices, speakWithVoice, type EarVoice } from "@/lib/learning/voices";
import type { SoundEntry } from "@/lib/modes/soundLibrary";
import { modes, useModes } from "@/lib/modes/store";
import { savedWordsWithSound } from "@/lib/modes/words";
import { useStore } from "@/lib/store";
import { normalizeWords } from "@/lib/text";
import { useConfig } from "../ConfigContext";
import { Label, LinkButton, Note, Plate, Sound } from "../ds/ui";
import { MouthDiagram } from "./MouthDiagram";
import { SaveWord } from "./SaveWord";

const PARTS = [
  ["Tongue", "tongue"],
  ["Lips", "lips"],
  ["Jaw", "jaw"],
  ["Air and voice", "air"],
] as const;

/**
 * The library half of a sound's page: how to make it, what Spanish does
 * instead, how it sounds in several voices, and where it sits in my own words.
 * All text comes from the static sound library. Nothing here is a score.
 */
export function SoundGuide({ phoneme, entry, examples }: { phoneme: string; entry: SoundEntry; examples: readonly string[] }) {
  const { azure } = useConfig();
  const store = useStore();
  const extra = useModes();
  const [voices, setVoices] = useState<EarVoice[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const content = contentFor(phoneme);
  const pair = content?.pairs[0] ?? null;
  const hints = extra.settings.spanishHints;

  useEffect(() => {
    let alive = true;
    void listEarVoices(azure).then((list) => {
      if (alive) setVoices(list);
    });
    return () => {
      alive = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [azure]);

  // Words that a scored take has shown to contain this sound, kept only if they are in my scripts.
  const mine = useMemo(() => {
    const heard = new Set<string>();
    for (const result of Object.values(store.results)) {
      for (const w of result.words) if (w.status !== "insertion" && w.phonemes.some((p) => p.phoneme === phoneme)) heard.add(w.text.toLowerCase().replace(/[^a-z']/g, ""));
    }
    for (const e of examples) heard.add(e.toLowerCase());
    const inScripts = new Set(store.scripts.filter((s) => !s.tags.includes("drill")).flatMap((s) => normalizeWords(s.text)));
    return [...heard].filter((w) => w && inScripts.has(w)).slice(0, 6);
  }, [store.results, store.scripts, examples, phoneme]);
  const saved = useMemo(() => savedWordsWithSound(extra.words, wordsWithSound(phoneme, Object.values(store.results), examples), 4), [extra.words, store.results, examples, phoneme]);
  const words = mine.length > 0 ? mine : [entry.keyword, ...(content?.pairs.slice(0, 3).map((p) => p.target) ?? [])].filter((w, i, all) => all.indexOf(w) === i);

  const say = async (text: string, voice: EarVoice, key: string) => {
    setProblem(null);
    setPlaying(key);
    try {
      await speakWithVoice(text, voice);
    } catch {
      setProblem("That voice could not play. Try another one.");
    } finally {
      setPlaying(null);
    }
  };

  return (
    <section aria-labelledby="guide-title" className="mt-20 border-t border-rule-strong pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>Sound library</Label>
          <h2 id="guide-title" className="display mt-2 text-4xl">
            How to make <Sound>{phoneme}</Sound>, as in <span className="display-italic">{entry.keyword}</span>
          </h2>
        </div>
        <button type="button" role="switch" aria-checked={hints} onClick={() => modes.setSetting("spanishHints", !hints)} className={`label press border px-3 py-2 ${hints ? "border-fg bg-fg !text-bg" : "border-rule-strong text-fg-2 hover:border-fg hover:!text-fg"}`}>
          Spanish hints {hints ? "on" : "off"}
        </button>
      </div>

      <div className="mt-10 grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Plate caption="Mouth position" aside={<Label as="span">Schematic, not anatomy</Label>}>
          <MouthDiagram shape={entry.mouth} className="mx-auto w-full max-w-sm" />
          <p className="mt-3 text-xs leading-relaxed text-fg-3">
            Side view, lips on the left. <span className="text-signal">Tongue</span>, <span className="text-model">air</span>
            {entry.mouth.to ? ", and a dashed outline for where the tongue ends." : "."}
          </p>
        </Plate>

        <div>
          <dl className="divide-y divide-rule border-y border-rule">
            {PARTS.map(([label, key]) => (
              <div key={key} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <dt className="label pt-1 text-fg-3">{label}</dt>
                <dd className="text-[0.9375rem] leading-relaxed">{entry[key]}</dd>
              </div>
            ))}
          </dl>
          {hints && (
            <p lang="es" className="mt-5 border-l-2 border-model pl-4 text-[0.9375rem] leading-relaxed">
              <span className="label mb-1 block text-fg-3" lang="en">
                En español
              </span>
              {entry.es}
            </p>
          )}
          <div className="mt-8">
            <Label>The Spanish trap</Label>
            <p className="mt-3 text-[0.9375rem] leading-relaxed">{entry.trap ?? "None. Spanish has this sound, so it should already be clear. If it scores low, the cause is usually speed or the sounds around it."}</p>
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-x-16 gap-y-12 lg:grid-cols-2">
        <div>
          <Label>{mine.length > 0 ? "In your scripts" : "Words to start with"}</Label>
          <p className="mt-2 text-sm text-fg-3">{mine.length > 0 ? "Words from your own scripts where this sound was heard. Pick a voice to hear one." : "None of your scored words contain this sound yet, so these are common ones."}</p>
          <ul className="mt-5 divide-y divide-rule border-y border-rule">
            {words.map((word) => (
              <li key={word} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="display text-2xl">{word}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {voices.map((voice) => (
                    <button key={voice.id} type="button" onClick={() => void say(word, voice, `${word}:${voice.id}`)} aria-label={`Hear ${word}, voice ${voice.label}`} className={`label press border px-2.5 py-1.5 ${playing === `${word}:${voice.id}` ? "border-model !text-model" : "border-rule-strong text-fg-2 hover:border-fg hover:!text-fg"}`}>
                      {voice.label}
                    </button>
                  ))}
                  <SaveWord word={word} />
                </span>
              </li>
            ))}
          </ul>
          {voices.length === 0 && <p className="mt-4 text-sm text-fg-3">This browser has no English voice installed, so there is no model audio here.</p>}
          {saved.length > 0 && (
            <p className="mt-4 text-sm text-fg-3">
              From My words: <span className="text-fg">{saved.join(", ")}</span>
            </p>
          )}
          {problem && (
            <p role="alert" className="mt-4 text-sm text-poor">
              {problem}
            </p>
          )}
        </div>

        <div>
          <Label>Minimal pair</Label>
          {pair && content ? (
            <>
              <p className="mt-2 text-sm text-fg-3">
                One sound apart. Hear both, then say both. If you cannot hear the difference yet, train the ear first.
              </p>
              <p className="display mt-5 text-4xl">
                {pair.target} <span className="text-fg-3">/</span> <span className="text-fg-2">{pair.contrast}</span>
              </p>
              <p className="mt-2 text-sm text-fg-3">
                <Sound>{phoneme}</Sound> against {content.contrastSound === "silence" ? "the sound left out" : <Sound>{content.contrastSound}</Sound>}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {voices.map((voice) => (
                  <button key={voice.id} type="button" onClick={() => void say(`${pair.target}. ${pair.contrast}.`, voice, `pair:${voice.id}`)} aria-label={`Hear the pair, voice ${voice.label}`} className={`label press border px-2.5 py-1.5 ${playing === `pair:${voice.id}` ? "border-model !text-model" : "border-rule-strong text-fg-2 hover:border-fg hover:!text-fg"}`}>
                    {voice.label}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <LinkButton href={`/ear?p=${encodeURIComponent(phoneme)}`}>Ear training, {content.pairs.length} pairs</LinkButton>
                <LinkButton href={`/session/review?p=${encodeURIComponent(phoneme)}`}>Say it, scored</LinkButton>
              </div>
            </>
          ) : (
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-2">No pair drill for this sound. It is rarely the reason a Spanish speaker is misunderstood, so the drills go to the sounds that are.</p>
          )}
        </div>
      </div>
      <div className="mt-12">
        <Note>Written as a learner’s guide, not reviewed by a speech therapist. The aim is to be understood the first time, not to remove your accent.</Note>
      </div>
    </section>
  );
}
