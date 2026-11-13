"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useCompare } from "@/hooks/useCompare";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { buildAssessmentResult, buildTranscriptResult } from "@/lib/azure/normalize";
import { describeDue } from "@/lib/learning/schedule";
import { modes, useModes } from "@/lib/modes/store";
import { MAX_TRIES, triesLeft, tryState } from "@/lib/modes/trust";
import { useEventPlan } from "@/lib/modes/useEventPlan";
import { addWords, isSaved, parseBulk, wordReview } from "@/lib/modes/words";
import { newId } from "@/lib/store";
import { useConfig } from "../ConfigContext";
import { band, BAND_TEXT, Button, Label, LinkButton, Loading, Note, PageHeader, StateBlock } from "../ds/ui";
import { ErrorState } from "../errorStates";
import { RecordControl } from "../RecordControl";
import { VoiceField } from "../voice/VoiceField";
import { SaveWord } from "./SaveWord";

const FROM_LABEL = { saved: "saved", bulk: "added in bulk", "retry-cap": "from a capped retry" } as const;
const SESSION_WORDS = 8;

/** My words: the vocabulary I chose to keep, each on its own review schedule. */
export function WordsPage() {
  const atlas = useAtlas();
  const { azure } = useConfig();
  const { words: all } = useModes();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const words = atlas.savedWords;
  const due = atlas.dueWords;
  const parsed = useMemo(() => parseBulk(draft), [draft]);

  const add = () => {
    if (parsed.length === 0) return;
    const source = atlas.demoMode ? "demo" : azure ? "azure" : "transcript";
    const { words: next, added } = addWords(all, parsed, parsed.length > 1 ? "bulk" : "saved", source, new Date(), () => newId("word"));
    modes.setWords(next);
    setMessage(added === 0 ? "Already in your list." : `Added ${added} ${added === 1 ? "word" : "words"}${added < parsed.length ? `. ${parsed.length - added} were already there.` : "."}`);
    setDraft("");
  };

  if (!atlas.hydrated) return <Loading label="Reading your words" />;

  return (
    <div>
      <PageHeader
        eyebrow="My words"
        title={
          <>
            The words your work <span className="display-italic">runs on</span>.
          </>
        }
        aside={
          due.length > 0 ? (
            <LinkButton href="/words/review" variant="solid" size="lg">
              Review {Math.min(due.length, SESSION_WORDS)} due
            </LinkButton>
          ) : undefined
        }
      >
        Product names, client names, the terms you say every week. Save a word from any screen, or paste a list here. Each one comes back on the same stretching schedule as your sounds: 1, 3, 7, then 14 days.
      </PageHeader>

      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-label="Saved words">
          <div className="flex items-baseline justify-between gap-4">
            <Label as="h2">
              {words.length} saved · {due.length} due
            </Label>
          </div>
          {words.length === 0 ? (
            <p className="mt-6 max-w-md text-base leading-relaxed text-fg-2">Nothing saved yet. Add the five words you most need to land in your next meeting.</p>
          ) : (
            <ul className="mt-5 divide-y divide-rule border-y border-rule">
              {words.map((w) => {
                const state = wordReview(w, atlas.now);
                const last = [...w.reviews].reverse().find((r) => r.score !== null)?.score ?? null;
                return (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
                    <div className="min-w-0">
                      <p className="display truncate text-2xl">{w.word}</p>
                      <p className="mt-1 text-xs text-fg-3">
                        {FROM_LABEL[w.from]}
                        {w.source === "demo" ? " · sample" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-5">
                      {last !== null && <span className={`numeral text-3xl ${BAND_TEXT[band(last)]}`}>{Math.round(last)}</span>}
                      <span className={`label ${state === null || state.due ? "!text-signal" : "text-fg-3"}`}>{state === null ? "new · due now" : describeDue(state, atlas.now)}</span>
                      <button type="button" onClick={() => modes.removeWord(w.id)} aria-label={`Remove ${w.word}`} className="label text-fg-3 hover:text-poor">
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Add words">
          <Label as="h2">Add words</Label>
          <label htmlFor="bulk" className="mt-3 block text-sm text-fg-2">
            One per line, or separated by commas. Short phrases are fine.
          </label>
          <textarea
            id="bulk"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setMessage(null);
            }}
            rows={6}
            placeholder={"quarterly forecast\nstakeholder\nthroughput"}
            className="mt-3 w-full border border-rule-strong bg-surface px-4 py-3 text-base leading-relaxed outline-none placeholder:text-fg-3 focus:border-fg"
          />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button variant="solid" onClick={add} disabled={parsed.length === 0}>
              {parsed.length > 1 ? `Add ${parsed.length} words` : "Add"}
            </Button>
            {message && (
              <p role="status" className="text-sm text-fg-2">
                {message}
              </p>
            )}
          </div>
          <div className="mt-8">
            <Note>{azure ? "Saved words are scored when you review them. Each review sends that one word's audio to Azure Speech." : atlas.demoMode ? "Demo: reviews are simulated, no microphone is used." : "Without an Azure key a review checks that the word was recognised. It cannot score the sounds, and it says so."}</Note>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Deterministic stand-in scores for Demo mode: a first try that is close, then a clear one. */
function demoScore(word: string, tryNumber: number): number {
  const seed = [...word].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return Math.min(96, 64 + (seed % 9) + (tryNumber - 1) * 14);
}

/** Review saved words: hear it, say it, see the score. Three tries at most, then on to the next. */
export function WordsReview() {
  const router = useRouter();
  const params = useSearchParams();
  const eventId = params.get("event");
  const { azure } = useConfig();
  const atlas = useAtlas();
  const { events, words: all } = useModes();
  const event = eventId ? events.find((e) => e.id === eventId) ?? null : null;
  const { plan } = useEventPlan(event);
  const player = useCompare();

  // The list is fixed when the review starts, so finishing a word does not reshuffle it.
  const live = useMemo(() => (event ? plan?.riskyWords ?? [] : atlas.dueWords.map((w) => w.word)).slice(0, SESSION_WORDS), [event, plan, atlas.dueWords]);
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const list = frozen ?? live;
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState(false);
  const [tries, setTries] = useState<(number | null)[]>([]);
  const [recognised, setRecognised] = useState<boolean | null>(null);
  const [done, setDone] = useState<{ word: string; score: number | null; tries: number }[]>([]);
  const word = list[index] ?? null;
  const latest = tries.length ? tries[tries.length - 1] ?? null : null;
  const scored = azure || atlas.demoMode;
  // Without scores there is nothing to chase: one try, then on.
  const state = tries.length === 0 ? "again" : scored ? tryState(latest, tries.length) : "capped";

  const keep = useCallback(
    (score: number | null, wasHeard: boolean) => {
      if (!frozen) setFrozen(list);
      setTries((t) => [...t, score]);
      setRecognised(wasHeard);
    },
    [frozen, list],
  );

  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (!outcome || !word) return;
      const meta = { id: newId("wordtake"), createdAt: new Date().toISOString(), scriptId: "my-words", scriptTitle: "My words", referenceText: word };
      const take = azure ? buildAssessmentResult(outcome.segments, meta) : buildTranscriptResult(outcome.transcript, outcome.durationMs, meta);
      const said = take.words.filter((w) => w.refIndex !== null && w.status !== "omission");
      const values = said.map((w) => w.accuracy).filter((a): a is number => a !== null);
      keep(values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, said.length > 0);
    },
    [azure, keep, word],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const recording = recorder.phase === "recording";

  const listen = useCallback(async () => {
    if (!word) return;
    await player.playModel(word);
    setHeard(true);
  }, [player, word]);
  const speak = useCallback(() => {
    if (word && heard && state === "again") void recorder.start(word);
  }, [heard, recorder, state, word]);
  const simulate = useCallback(() => {
    if (word && heard && state === "again") keep(demoScore(word, tries.length + 1), true);
  }, [heard, keep, state, tries.length, word]);

  const next = useCallback(() => {
    if (!word || tries.length === 0) return;
    const best = tries.reduce<number | null>((b, t) => (t === null ? b : b === null ? t : Math.max(b, t)), null);
    // A capped word is kept for later, even when it came from an event and was not saved before.
    if (scored && state === "capped" && !isSaved(all, word)) modes.setWords(addWords(all, [word], "retry-cap", atlas.demoMode ? "demo" : "azure", new Date(), () => newId("word")).words);
    modes.addWordReview(word, latest, new Date().toISOString());
    setDone((d) => [...d, { word, score: best, tries: tries.length }]);
    setIndex((i) => i + 1);
    setTries([]);
    setHeard(false);
    setRecognised(null);
  }, [all, atlas.demoMode, latest, scored, state, tries, word]);

  const finished = list.length > 0 && index >= list.length;
  const back = event ? "/event" : "/words";
  useHotkeys(
    finished
      ? { enter: () => router.push(back) }
      : {
          m: () => void listen(),
          space: atlas.demoMode ? undefined : recording ? recorder.stop : recorder.phase === "idle" && heard && state === "again" ? speak : undefined,
          enter: tries.length > 0 && state !== "again" ? next : atlas.demoMode && heard ? simulate : undefined,
          n: tries.length > 0 ? next : undefined,
        },
  );

  if (!atlas.hydrated) return <Loading label="Reading your words" />;
  if (list.length === 0) {
    return (
      <StateBlock kind="empty" title={event ? "No risky words in this script." : "No words are due."} action={<LinkButton href={back} variant="solid">Back</LinkButton>}>
        {event ? "Nothing in it matches your weak sounds or saved words yet. Read it once so the app can find them." : "Saved words come back on their own schedule. Add more, or come back tomorrow."}
      </StateBlock>
    );
  }

  if (finished) {
    const clear = done.filter((d) => d.score !== null && d.score >= 80).length;
    return (
      <div className="max-w-3xl">
        <Label>Words review · done</Label>
        <h1 className="display rise mt-4 text-(length:--text-display-m)">
          {scored ? (
            <>
              {clear} of {done.length} <span className="display-italic">clear</span>.
            </>
          ) : (
            <>
              {done.length} words <span className="display-italic">said</span>.
            </>
          )}
        </h1>
        <ul className="mt-10 divide-y divide-rule border-y border-rule">
          {done.map((d) => (
            <li key={d.word} className="flex items-center justify-between gap-6 py-4">
              <span className="display text-2xl">{d.word}</span>
              <span className="flex items-center gap-5">
                <span className="label text-fg-3">
                  {d.tries} {d.tries === 1 ? "try" : "tries"}
                </span>
                {d.score !== null ? <span className={`numeral text-3xl ${BAND_TEXT[band(d.score)]}`}>{Math.round(d.score)}</span> : <span className="label text-fg-3">not scored</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-fg-3">{scored ? "Clear words wait longer before they come back. The others return sooner." : "Transcript-only mode: nothing was scored, so the schedule did not move."}</p>
        <div className="mt-8">
          <LinkButton href={back} variant="solid" size="lg" hotkey="enter">
            {event ? "Back to the plan" : "Back to my words"}
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link href={back} className="label text-fg-3 hover:text-fg">
          ← {event ? event.name : "My words"}
        </Link>
        <Label as="span">
          Word {index + 1} of {list.length}
          {atlas.demoMode && " · demo, simulated scores"}
        </Label>
      </div>
      <ol className="mb-10 flex gap-1.5" aria-hidden>
        {list.map((w, i) => (
          <li key={w} className={`h-[3px] flex-1 ${i < index ? "bg-fg" : i === index ? "bg-signal" : "bg-rule"}`} />
        ))}
      </ol>

      {recorder.error && (
        <div className="mb-8">
          <ErrorState error={recorder.error} compact />
        </div>
      )}

      <div className="flex flex-1 flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <p className="prompter !text-[clamp(3rem,9vw,6.5rem)] !leading-none">{word}</p>
        <div aria-live="polite" className="pb-2 text-right">
          {tries.length > 0 &&
            (latest !== null ? (
              <p className={`numeral text-[5.5rem] ${BAND_TEXT[band(latest)]}`} aria-label={`Score ${Math.round(latest)}`}>
                {Math.round(latest)}
              </p>
            ) : (
              <p className="display text-3xl">{recognised ? "Recognised" : "Not recognised"}</p>
            ))}
        </div>
      </div>

      <div className="relative mt-10 border-t border-rule">
        <VoiceField stream={recorder.stream} active={recording} className="h-32" />
        <div className="absolute inset-0 flex flex-wrap items-center gap-4 px-1">
          <Button variant={heard ? "outline" : "solid"} size="lg" onClick={() => void listen()} busy={player.playing === "model"} hotkey="M" disabled={recording}>
            {heard ? "Model again" : "Hear it first"}
          </Button>
          {state !== "again" ? (
            <Button variant="solid" size="lg" onClick={next} hotkey="enter">
              {index >= list.length - 1 ? "Finish" : "Next word"}
            </Button>
          ) : atlas.demoMode ? (
            <Button variant="solid" size="lg" onClick={simulate} disabled={!heard} hotkey="enter">
              {tries.length ? "Simulate another try" : "Simulate my try"}
            </Button>
          ) : (
            <RecordControl phase={recorder.phase} onStart={speak} onStop={recorder.stop} disabled={!heard} idleLabel={tries.length ? "Try again" : "Say it"} />
          )}
          {word && event && <SaveWord word={word} />}
        </div>
      </div>
      <div className="mt-4 max-w-2xl">
        <Note>
          {state === "clear"
            ? "Clear. That is the target, not 100. On to the next."
            : state === "capped" && scored
              ? `That was try ${MAX_TRIES}, the cap. It stays in My words and comes back on a later day.`
              : state === "capped"
                ? "Transcript-only mode: the word was checked, the sounds were not scored. Add an Azure key for a score."
                : tries.length > 0
                  ? `${triesLeft(tries.length)} of ${MAX_TRIES} tries left. Hear the model once more, then go again.`
                  : !heard
                    ? "Listen first. The microphone opens after the model has played."
                    : atlas.demoMode
                      ? "Demo: no microphone is used. A sample score stands in for your voice."
                      : "Say the word once, at an easy pace."}
        </Note>
        {player.note && <p className="mt-2 text-xs text-fg-3">{player.note}</p>}
      </div>
    </div>
  );
}
