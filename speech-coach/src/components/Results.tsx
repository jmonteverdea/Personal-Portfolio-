"use client";

import gsap from "gsap";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useLenis } from "@/hooks/useLenis";
import { guideFor } from "@/lib/coach/local";
import { phonemeStatsFor } from "@/lib/history";
import { scriptDelta, soundChanges } from "@/lib/learning/bests";
import { useLearning } from "@/lib/learning/store";
import { useModes } from "@/lib/modes/store";
import { isClear, shouldFlag } from "@/lib/modes/trust";
import { stopPlayback } from "@/lib/speech/playback";
import { useStore } from "@/lib/store";
import type { AssessmentResult, WordResult } from "@/lib/types";
import { band, BAND_TEXT, bare, Button, Delta, formatDate, Label, LinkButton, Loading, Note, ScoreBar, Sound, StateBlock, wordClass } from "./ds/ui";
import { CoachingPanel } from "./results/Coaching";
import { Pacing, TakeAudio } from "./results/Extras";
import { RetryPanel, type RetryTarget } from "./results/RetryPanel";
import { WordDetail } from "./results/WordDetail";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Focus {
  phoneme: string;
  average: number;
  heardAs: string | null;
  words: WordResult[];
  /** The word to retry first: the one where the sound scored lowest. */
  worst: WordResult;
  recurring: number;
}

/** The one thing to fix next: among this take's weak sounds, the one that recurs most across my history. */
function useFocus(result: AssessmentResult): Focus | null {
  const atlas = useAtlas();
  return useMemo(() => {
    const stats = phonemeStatsFor(result);
    const rank = new Map(atlas.priorities.map((p, i) => [p.phoneme, i]));
    const weak = Object.entries(stats)
      .map(([phoneme, s]) => ({ phoneme, average: s.sum / s.count, count: s.count }))
      .filter((s) => s.average < 80)
      .sort((a, b) => (rank.get(a.phoneme) ?? 999) - (rank.get(b.phoneme) ?? 999) || a.average - b.average);
    const top = weak[0];
    if (!top) return null;
    const holders = result.words
      .filter((w) => w.status !== "insertion" && w.phonemes.some((p) => p.phoneme === top.phoneme))
      .map((w) => ({ w, score: Math.min(...w.phonemes.filter((p) => p.phoneme === top.phoneme).map((p) => p.accuracy)) }))
      .sort((a, b) => a.score - b.score);
    const worst = holders[0]?.w;
    if (!worst) return null;
    const heard = worst.phonemes.find((p) => p.phoneme === top.phoneme)?.alternatives[0];
    return {
      phoneme: top.phoneme,
      average: top.average,
      heardAs: heard && heard.phoneme !== top.phoneme ? heard.phoneme : null,
      words: holders.filter((h) => h.score < 80).map((h) => h.w).slice(0, 5),
      worst,
      recurring: atlas.priorities.find((p) => p.phoneme === top.phoneme)?.weakSessions ?? 0,
    };
  }, [atlas.priorities, result]);
}

function SubScores({ scores }: { scores: NonNullable<AssessmentResult["scores"]> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6">
        <ScoreBar label="Accuracy" score={scores.accuracy} title="How close your sounds are to a native speaker's." />
        <ScoreBar label="Fluency" score={scores.fluency} title="Natural use of pauses between words." />
        <ScoreBar label="Completeness" score={scores.completeness} title="Share of the script you said." />
        <ScoreBar label="Prosody" score={scores.prosody} title="Stress, intonation, speed and rhythm." />
      </div>
      <p className="label mt-5 text-fg-3">0 to 100 · the tick marks 80</p>
    </>
  );
}

type Tab = "coaching" | "pacing" | "take";
const TABS: { id: Tab; label: string }[] = [
  { id: "coaching", label: "Coaching" },
  { id: "pacing", label: "Pacing" },
  { id: "take", label: "Your take" },
];

function ResultView({ result, guided, replay }: { result: AssessmentResult; guided: boolean; replay: boolean }) {
  const store = useStore();
  const atlas = useAtlas();
  const { retries } = useLearning();
  const { overrides } = useModes();
  const focus = useFocus(result);
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [retry, setRetry] = useState<RetryTarget | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  useLenis();

  const delta = useMemo(() => scriptDelta(store.sessions, result.id), [store.sessions, result.id]);
  const changes = useMemo(() => soundChanges(atlas.sessions, result.id), [atlas.sessions, result.id]);
  const scores = result.scores;
  const word = selected === null ? null : result.words.find((w) => w.index === selected) ?? null;
  const counts = {
    skipped: result.words.filter((w) => w.status === "omission").length,
    added: result.words.filter((w) => w.status === "insertion").length,
  };
  const sentenceAverage = (i: number): number | null => {
    const scored = result.words.filter((w) => w.sentenceIndex === i && w.status !== "insertion");
    if (scored.length === 0) return null;
    const values = scored.map((w) => (w.status === "omission" ? 0 : w.accuracy));
    return values.some((v) => v === null) ? (scored.some((w) => w.status === "omission") ? 0 : null) : (values as number[]).reduce((a, b) => a + b, 0) / values.length;
  };
  // Transcript-only: nothing is scored, so the next action is the sentence with the most skipped words.
  const weakestSentence = useMemo(() => {
    const bySentence = new Map<number, number>();
    for (const w of result.words) if (w.status === "omission" && w.sentenceIndex !== null) bySentence.set(w.sentenceIndex, (bySentence.get(w.sentenceIndex) ?? 0) + 1);
    return [...bySentence.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [result.words]);

  /* ----- signature moment: the reveal ----- */
  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const key = `speech-coach.revealed.${result.id}`;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(key) === "1";
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Private mode: just play it.
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reading feedback is quiet time. The reveal plays once per take, never on a revisit.
    if (reduce || (seen && !replay)) return;

    const ctx = gsap.context(() => {
      const words = gsap.utils.toArray<HTMLElement>("[data-w]");
      const counters = gsap.utils.toArray<HTMLElement>("[data-count]");
      const bars = gsap.utils.toArray<HTMLElement>("[data-bar]");
      const settle = gsap.utils.toArray<HTMLElement>("[data-settle]");
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline.current = tl;

      gsap.set(words, { opacity: 0.12 });
      gsap.set(bars, { scaleX: 0 });
      gsap.set(settle, { opacity: 0, y: 28 });
      gsap.set("[data-rule]", { scaleX: 0 });

      counters.forEach((node, i) => {
        const target = Number(node.dataset.count ?? 0);
        const state = { value: 0 };
        node.textContent = "0";
        tl.to(state, { value: target, duration: i === 0 ? 1.5 : 0.9, ease: "power2.out", onUpdate: () => (node.textContent = String(Math.round(state.value))) }, i === 0 ? 0.1 : 0.5 + i * 0.09);
      });
      tl.to(bars, { scaleX: 1, duration: 0.9, stagger: 0.09 }, 0.6);
      // The script paints in at reading speed, capped so a long script does not make me wait.
      const paint = Math.min(2.6, words.length * 0.045);
      tl.to(words, { opacity: 1, duration: 0.35, ease: "power1.out", stagger: { amount: paint } }, 1.2);
      tl.to("[data-rule]", { scaleX: 1, duration: 0.8, ease: "power2.inOut" }, `>-0.1`);
      tl.to(settle, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12 }, "<0.25");
    }, el);

    return () => {
      timeline.current = null;
      ctx.revert();
    };
  }, [result.id, replay]);

  useEffect(() => () => stopPlayback(), []);

  const skipReveal = () => {
    const tl = timeline.current;
    if (tl && tl.progress() < 1) tl.progress(1);
  };
  const fixNow = () => {
    if (focus) {
      setSelected(focus.worst.index);
      setRetry({ kind: "word", index: focus.worst.index });
    } else if (weakestSentence !== null) {
      setRetry({ kind: "sentence", index: weakestSentence });
    }
  };

  // Shortcuts for the top level. A selected word or an open retry has its own.
  useHotkeys({ r: word || retry ? undefined : focus || weakestSentence !== null ? fixNow : undefined, escape: skipReveal }, !retry);

  // Score trust: a low word is only drawn as an error when there is something physical to change and I have not overridden it.
  const fine = new Set(overrides.filter((o) => o.resultId === result.id).map((o) => o.refIndex));
  const quiet = (w: (typeof result.words)[number]) =>
    w.status !== "omission" && w.status !== "insertion" && w.accuracy !== null && !isClear(w.accuracy) && !shouldFlag(w, w.refIndex !== null && fine.has(w.refIndex));
  const retriedWords = new Set(retries.filter((r) => r.resultId === result.id && r.kind === "word").map((r) => r.targetIndex));

  return (
    <div ref={root} onPointerDown={skipReveal}>
      {/* ----- title ----- */}
      <header className="mb-9 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div>
          <Link href="/scripts" className="label text-fg-3 hover:text-fg">
            ← Scripts
          </Link>
          <h1 className="display mt-3 max-w-4xl text-(length:--text-display-s)">{result.scriptTitle}</h1>
          <Label className="mt-3">
            {formatDate(result.createdAt)} ·{" "}
            {result.source === "demo" ? "Demo · sample data" : result.source === "transcript" ? "Transcript-only · no sound scores" : `Azure · ${result.segmentCount} ${result.segmentCount === 1 ? "segment" : "segments"}`}
          </Label>
        </div>
        <div className="flex flex-wrap gap-3">
          {guided && (
            <LinkButton href="/session" variant="solid">
              Finish session
            </LinkButton>
          )}
          <LinkButton href={`/practice?script=${encodeURIComponent(result.scriptId)}`}>Record again</LinkButton>
        </div>
      </header>

      {/* ----- scores and the script as heard ----- */}
      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <section aria-label="Scores">
          {scores ? (
            <>
              <Label>Overall</Label>
              <p className={`numeral mt-1 text-[clamp(7rem,13vw,11rem)] ${BAND_TEXT[band(Math.round(scores.overall))]}`}>
                <span data-count={Math.round(scores.overall)}>{Math.round(scores.overall)}</span>
              </p>
              <p className="mt-4 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1">
                {delta?.delta != null && <Delta value={delta.delta} suffix=" since your last take" />}
                {delta?.isBest && <span className="label !text-good">Personal best for this script</span>}
                {delta && delta.previous === null && <span className="label text-fg-3">First take of this script</span>}
              </p>
              {/* On a phone the four sub-scores move below the next action: the thing to do comes before the detail. */}
              <div className="mt-8 hidden lg:block">
                <SubScores scores={scores} />
              </div>
            </>
          ) : (
            <>
              <Label>Scores</Label>
              <p className="display mt-3 text-(length:--text-display-s)">Words only.</p>
              <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-fg-2">
                This take was recorded without Azure Speech, so no sounds were measured and no scores are shown. The script on the right still shows what you skipped and what you added.
              </p>
            </>
          )}
        </section>

        <section aria-label="The script as heard">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <Label>The script, as heard</Label>
            <Label as="span">
              {counts.skipped} skipped · {counts.added} added · select a word
            </Label>
          </div>
          <div className="prompter mt-5 !text-[clamp(1.5rem,1.05rem+1.5vw,2.25rem)] !leading-[1.55]">
            {result.sentences.map((_, si) => {
              const average = sentenceAverage(si);
              const weak = average !== null && average < 80;
              // Words of this sentence, plus any added words spoken inside it.
              const first = result.words.findIndex((w) => w.sentenceIndex === si);
              const last = result.words.findLastIndex((w) => w.sentenceIndex === si);
              const items = first === -1 ? [] : result.words.slice(first, last + 1);
              return (
                <span key={si}>
                  {items.map((w) => (
                    <span key={w.index}>
                      <button
                        type="button"
                        data-w
                        onClick={() => {
                          setRetry(null);
                          setSelected(w.index === selected ? null : w.index);
                        }}
                        aria-pressed={w.index === selected}
                        aria-label={`${bare(w.text)}: ${w.status}${w.accuracy !== null ? `, ${Math.round(w.accuracy)}` : ""}`}
                        className={`rounded-[2px] ${quiet(w) ? "w-plain" : wordClass(w)} ${w.index === selected ? "bg-fg !text-bg !decoration-bg" : "hover:bg-surface"}`}
                      >
                        {w.status === "insertion" && <span aria-hidden>+</span>}
                        {w.text}
                        {w.refIndex !== null && retriedWords.has(w.refIndex) && <sup className="ml-0.5 font-mono text-[0.5em] not-italic text-good" title="Retried">↻</sup>}
                      </button>{" "}
                    </span>
                  ))}
                  {weak && (
                    <button
                      type="button"
                      data-w
                      onClick={() => {
                        setSelected(null);
                        setRetry({ kind: "sentence", index: si });
                      }}
                      className="label press mr-3 inline-flex h-6 -translate-y-1 items-center gap-1 rounded-full bg-signal-soft px-2 align-middle !text-[0.625rem] !tracking-[0.08em] !text-signal hover:bg-signal hover:!text-bg"
                      aria-label={`Retry sentence ${si + 1}, average ${Math.round(average ?? 0)}`}
                    >
                      ↻ {Math.round(average ?? 0)}
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Legend">
            {scores ? (
              <>
                <li className="w-good">80 and up</li>
                <li className="w-fair">60 to 79</li>
                <li className="w-poor">under 60</li>
              </>
            ) : (
              <li className="w-plain">said, not scored</li>
            )}
            <li className="w-omit">skipped</li>
            <li className="w-insert">+added</li>
          </ul>

          <div className="mt-8 space-y-6">
            {word && !retry && (
              <WordDetail key={word.index} word={word} result={result} hotkeys={!retry} onClose={() => setSelected(null)} onRetry={() => setRetry({ kind: "word", index: word.index })} />
            )}
            {retry && <RetryPanel key={`${retry.kind}-${retry.index}`} result={result} target={retry} onClose={() => setRetry(null)} />}
          </div>
        </section>
      </div>

      {/* ----- what improved, then the one thing to fix next ----- */}
      <div data-rule className="mt-12 h-px origin-left bg-fg" />
      <section data-settle className="grid gap-x-16 gap-y-10 pt-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]" aria-label="What to do next">
        <div>
          <Label>What improved</Label>
          {changes.improved.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {changes.improved.slice(0, 4).map((c) => (
                <li key={c.phoneme} className="flex items-baseline gap-4">
                  <Sound className="w-14 text-2xl">{c.phoneme}</Sound>
                  <span className="font-mono text-sm tabular-nums text-fg-2">
                    {c.before} → {c.after}
                  </span>
                  <Delta value={c.delta} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-3">
              {delta?.previous == null ? "This is the first take to compare against. The next one will show what moved." : "No sound moved by more than a few points since the last take."}
            </p>
          )}
          {changes.slipped.length > 0 && (
            <p className="mt-5 text-sm text-fg-3">
              Slipped: {changes.slipped.slice(0, 3).map((c, i) => (
                <span key={c.phoneme}>
                  {i > 0 && ", "}
                  <Sound>{c.phoneme}</Sound> {c.delta}
                </span>
              ))}
              . That is normal while a new sound settles.
            </p>
          )}
        </div>

        <div>
          <Label className="!text-signal">The one thing to fix next</Label>
          {focus ? (
            <>
              <h2 className="display mt-3 text-(length:--text-display-m)">
                <Sound className="text-signal">{focus.phoneme}</Sound>
                {focus.heardAs && (
                  <span className="text-fg-2">
                    , not <Sound>{focus.heardAs}</Sound>
                  </span>
                )}
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed">{guideFor(focus.phoneme)?.how ?? "Play the model for each word below and copy it slowly, one sound at a time."}</p>
              <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-2">
                It averaged {Math.round(focus.average)} here, in {focus.words.map((w) => `“${bare(w.text)}”`).join(", ")}.
                {focus.recurring > 1 && ` It has been weak in ${focus.recurring} of your sessions, which is why it comes before lower one-off scores.`}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button variant="signal" size="lg" onClick={fixNow} hotkey="R">
                  Fix “{bare(focus.worst.text)}” now
                </Button>
                <LinkButton href={`/session/review?p=${encodeURIComponent(focus.phoneme)}`} size="lg">
                  Drill <Sound>{focus.phoneme}</Sound>
                </LinkButton>
              </div>
            </>
          ) : weakestSentence !== null ? (
            <>
              <h2 className="display mt-3 text-(length:--text-display-m)">Say the whole sentence.</h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed">You skipped words in “{result.sentences[weakestSentence]}”. Read it once more on its own, slowly, to the last word.</p>
              <div className="mt-8">
                <Button variant="signal" size="lg" onClick={fixNow} hotkey="R">
                  Retry that sentence
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="display mt-3 text-(length:--text-display-m)">Nothing stands out.</h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fg-2">
                {scores ? "No sound averaged under 80 in this take. Try a longer or harder script." : "Every word of the script was said, in order. Add Azure Speech for sound-level feedback."}
              </p>
            </>
          )}
        </div>
      </section>

      {scores && (
        <section data-settle className="mt-14 lg:hidden" aria-label="Score breakdown">
          <SubScores scores={scores} />
        </section>
      )}

      {/* ----- full detail, one click deeper ----- */}
      <section data-settle className="mt-20" aria-label="More detail">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-rule py-4" role="tablist" aria-label="More detail">
          <Label as="span">More detail</Label>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(tab === t.id ? null : t.id)}
              className={`press text-lg ${tab === t.id ? "text-fg underline decoration-signal decoration-2 underline-offset-8" : "text-fg-2 hover:text-fg"}`}
            >
              {t.label}
              <span className="ml-2 font-mono text-sm text-fg-3" aria-hidden>
                {tab === t.id ? "−" : "+"}
              </span>
            </button>
          ))}
        </div>
        {tab && (
          <div id={`panel-${tab}`} role="tabpanel" className="pt-10">
            {tab === "coaching" && <CoachingPanel key={result.id} result={result} />}
            {tab === "pacing" && <Pacing result={result} />}
            {tab === "take" && <TakeAudio result={result} />}
          </div>
        )}
      </section>

      {!scores && (
        <div className="mt-12 max-w-xl">
          <Note>Add an Azure Speech key for accuracy, fluency, completeness and prosody scores, per-sound detail and word replay.</Note>
        </div>
      )}
    </div>
  );
}

export function Results() {
  const params = useSearchParams();
  const id = params.get("session");
  const { hydrated, results } = useStore();
  const result = id ? results[id] : undefined;

  if (!hydrated) return <Loading label="Loading the take" />;
  if (!result) {
    return (
      <StateBlock
        kind="empty"
        title="This take is no longer stored in full."
        action={
          <>
            <LinkButton href="/progress" variant="solid">
              See progress
            </LinkButton>
            <LinkButton href="/scripts" variant="quiet">
              Back to scripts
            </LinkButton>
          </>
        }
      >
        Only the most recent takes keep their word-by-word detail. Its scores are still in your history.
      </StateBlock>
    );
  }
  return <ResultView key={result.id} result={result} guided={params.get("guided") === "1"} replay={params.get("reveal") === "1"} />;
}
