"use client";

import { ArrowLeft, FileQuestion, Mic, Play, Volume2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toAppError } from "@/lib/errors";
import { playSlice, stopPlayback } from "@/lib/speech/playback";
import { speakReference } from "@/lib/speech/tts";
import { getTakeAudio, useStore } from "@/lib/store";
import type { AssessmentResult, WordResult } from "@/lib/types";
import { CoachingPanel } from "./CoachingPanel";
import { useConfig } from "./ConfigContext";
import { Button, Card, CardTitle, EmptyState, formatDate, Loading, Notice, Pill, scoreTone } from "./ui";

const bare = (text: string): string => text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

/* ---------- scores ---------- */

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="9" className="stroke-stone-100" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={tone.stroke}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums">{Math.round(score)}</span>
        <span className="text-xs text-muted">overall</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, hint }: { label: string; score: number | null; hint: string }) {
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">{score === null ? "not measured" : Math.round(score)}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score ?? undefined}>
        {score !== null && <div className={`h-full rounded-full ${scoreTone(score).bar}`} style={{ width: `${score}%` }} />}
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

function ScoresCard({ result }: { result: AssessmentResult }) {
  const { scores } = result;
  if (!scores) {
    return (
      <Card>
        <CardTitle>Scores</CardTitle>
        <Notice tone="warn" title="Phoneme scoring unavailable">
          This take was recorded in transcript-only mode, so nothing was measured and no scores are shown. The
          word-by-word comparison below still shows what you skipped or added. Add an Azure Speech key for accuracy,
          fluency, completeness and prosody scores.
        </Notice>
      </Card>
    );
  }
  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">All scores 0 to 100</span>}>Scores</CardTitle>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <ScoreRing score={scores.overall} />
        <div className="grid w-full flex-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <ScoreBar label="Accuracy" score={scores.accuracy} hint="How close your sounds are to a native speaker's." />
          <ScoreBar label="Fluency" score={scores.fluency} hint="Natural use of pauses between words." />
          <ScoreBar label="Completeness" score={scores.completeness} hint="Share of the script you actually said." />
          <ScoreBar label="Prosody" score={scores.prosody} hint="Stress, intonation, speed and rhythm." />
        </div>
      </div>
    </Card>
  );
}

/* ---------- pacing ---------- */

function PacingCard({ result }: { result: AssessmentResult }) {
  const { pacing, words } = result;
  const wpm = pacing.wordsPerMinute;
  const verdict = wpm === null ? null : wpm < 120 ? "On the slow side" : wpm <= 170 ? "Comfortable pace" : "Fast";
  return (
    <Card>
      <CardTitle>Pacing</CardTitle>
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div>
          <p className="text-4xl font-semibold tabular-nums">{wpm ?? "n/a"}</p>
          <p className="text-sm text-muted">words per minute{pacing.estimated ? " (estimate)" : ""}</p>
          {verdict && <p className="mt-2 text-sm font-medium">{verdict}</p>}
          <p className="mt-1 max-w-52 text-xs leading-relaxed text-muted">
            {pacing.estimated
              ? "Estimated from total recording time, including silence at the start and end."
              : "Rule of thumb for clear work speech: 130 to 160."}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium">
            Long pauses
            {pacing.longPauses && <span className="font-normal text-muted"> ({(pacing.longPauseThresholdMs / 1000).toFixed(1)}s or more)</span>}
          </h3>
          {pacing.longPauses === null ? (
            <p className="mt-2 text-sm text-muted">Pause detection needs Azure word timestamps. It is unavailable in transcript-only mode.</p>
          ) : pacing.longPauses.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None. You kept moving.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {pacing.longPauses.map((p) => (
                <li key={p.afterWordIndex} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{bare(words[p.afterWordIndex]?.text ?? "")}</span>
                  <span className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-xs tabular-nums">
                    {(p.durationMs / 1000).toFixed(1)}s
                  </span>
                  <span>{bare(words[p.beforeWordIndex]?.text ?? "")}</span>
                  <Pill tone={p.atSentenceBoundary ? "neutral" : "amber"}>{p.atSentenceBoundary ? "between sentences" : "mid-sentence"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------- word map ---------- */

function wordClass(word: WordResult): string {
  if (word.status === "omission") return "border-dashed border-stone-300 bg-white text-stone-400 line-through";
  if (word.status === "insertion") return "border-violet-200 bg-violet-50 text-violet-900 italic";
  if (word.accuracy === null) return "border-transparent bg-stone-100 text-ink";
  if (word.status === "mispronounced" || word.accuracy < 60) return "border-transparent bg-rose-100 text-rose-950";
  if (word.accuracy < 80) return "border-transparent bg-amber-100 text-amber-950";
  return "border-transparent bg-emerald-50 text-emerald-950";
}

function Legend({ scored }: { scored: boolean }) {
  const items = scored
    ? [
        ["bg-emerald-50 border-transparent", "80 and up"],
        ["bg-amber-100 border-transparent", "60 to 79"],
        ["bg-rose-100 border-transparent", "under 60"],
      ]
    : [["bg-stone-100 border-transparent", "said (not scored)"]];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded border ${cls}`} aria-hidden />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-dashed border-stone-400 bg-white" aria-hidden />
        <span className="line-through">skipped</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-violet-300 bg-violet-50" aria-hidden />
        <span className="italic">+ added</span>
      </span>
    </div>
  );
}

function statusText(word: WordResult): string {
  switch (word.status) {
    case "omission":
      return "Skipped. This script word was not heard.";
    case "insertion":
      return "Added. This word is not in the script at this point.";
    case "mispronounced":
      return word.spoken ? `Heard as "${word.spoken}".` : "Mispronounced.";
    default:
      return word.accuracy === null ? "Said. Not scored in transcript-only mode." : "Said correctly.";
  }
}

function WordDetail({ word, result }: { word: WordResult; result: AssessmentResult }) {
  const { azure } = useConfig();
  const [busy, setBusy] = useState<"reference" | "mine" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const audio = getTakeAudio(result.id);
  const canReplay = audio !== null && word.offsetMs !== null && word.durationMs !== null;
  const spoken = bare(word.text);

  const hearReference = async () => {
    setBusy("reference");
    setNote(null);
    try {
      const voice = await speakReference(spoken, azure);
      setNote(voice === "azure" ? "Played with an Azure neural voice." : "Played with your browser's built-in voice.");
    } catch (e) {
      setNote(toAppError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const replayMine = async () => {
    if (!audio || word.offsetMs === null || word.durationMs === null) return;
    setBusy("mine");
    setNote(null);
    try {
      await playSlice(audio, word.offsetMs, word.durationMs);
    } catch (e) {
      setNote(toAppError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const replayUnavailable =
    word.status === "omission"
      ? "You did not say this word, so there is nothing to replay."
      : result.source === "demo"
        ? "The sample result has no audio."
        : word.offsetMs === null
          ? "Word replay needs Azure word timestamps."
          : "The recording is kept only until you reload the page.";

  return (
    <div className="rounded-xl border border-line bg-paper p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold">{spoken}</p>
          <p className="mt-0.5 text-sm text-muted">
            {statusText(word)}
            {word.accuracy !== null && word.status !== "insertion" && (
              <>
                {" "}Word accuracy <span className={`font-semibold ${scoreTone(word.accuracy).text}`}>{Math.round(word.accuracy)}</span>.
              </>
            )}
          </p>
          {word.prosody && (word.prosody.unexpectedBreak || word.prosody.missingBreak) && (
            <p className="mt-1 text-sm text-amber-800">
              {word.prosody.unexpectedBreak ? "Unexpected pause before this word." : "A pause was expected before this word."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={busy === "reference"} disabled={busy !== null} onClick={() => void hearReference()}>
            {busy !== "reference" && <Volume2 className="h-4 w-4" aria-hidden />}
            Hear reference
          </Button>
          <Button size="sm" loading={busy === "mine"} disabled={!canReplay || busy !== null} title={canReplay ? undefined : replayUnavailable} onClick={() => void replayMine()}>
            {busy !== "mine" && <Play className="h-4 w-4" aria-hidden />}
            Replay my word
          </Button>
        </div>
      </div>
      {!canReplay && <p className="mt-2 text-xs text-muted">{replayUnavailable}</p>}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}

      {word.phonemes.length > 0 ? (
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">Phoneme scores for {spoken}</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="w-16 pb-1.5 font-medium">Sound</th>
              <th className="pb-1.5 font-medium">Score</th>
              <th className="w-28 pb-1.5 pl-3 font-medium">Heard as</th>
            </tr>
          </thead>
          <tbody>
            {word.phonemes.map((p, i) => {
              const tone = scoreTone(p.accuracy);
              const top = p.alternatives[0];
              const heard = top && top.phoneme !== p.phoneme ? top.phoneme : null;
              return (
                <tr key={i}>
                  <td className="ipa py-1 text-lg">/{p.phoneme}/</td>
                  <td className="py-1">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${p.accuracy}%` }} />
                      </div>
                      <span className={`w-8 text-right font-medium tabular-nums ${tone.text}`}>{Math.round(p.accuracy)}</span>
                    </div>
                  </td>
                  <td className="ipa py-1 pl-3">{heard ? <span className="text-rose-800">/{heard}/</span> : <span className="text-muted">as expected</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        word.status !== "omission" && (
          <p className="mt-3 text-sm text-muted">No phoneme data. Phoneme scoring needs Azure Speech.</p>
        )
      )}
    </div>
  );
}

function WordMap({ result }: { result: AssessmentResult }) {
  const [selected, setSelected] = useState<number | null>(null);
  const word = selected === null ? null : result.words[selected] ?? null;
  const counts = {
    omitted: result.words.filter((w) => w.status === "omission").length,
    inserted: result.words.filter((w) => w.status === "insertion").length,
    mispronounced: result.words.filter((w) => w.status === "mispronounced").length,
  };

  return (
    <Card>
      <CardTitle aside={<Legend scored={result.scores !== null} />}>Word by word</CardTitle>
      <p className="mb-4 text-sm text-muted">
        {counts.mispronounced} mispronounced, {counts.omitted} skipped, {counts.inserted} added. Click a word for its sounds.
      </p>
      <div className="flex flex-wrap gap-x-1.5 gap-y-2 text-lg leading-none">
        {result.words.map((w) => (
          <button
            key={w.index}
            type="button"
            onClick={() => setSelected(w.index === selected ? null : w.index)}
            aria-pressed={w.index === selected}
            aria-label={`${bare(w.text)}: ${w.status}${w.accuracy !== null ? `, accuracy ${Math.round(w.accuracy)}` : ""}`}
            className={`rounded-md border px-1.5 py-1.5 transition-shadow ${wordClass(w)} ${
              w.index === selected ? "ring-2 ring-accent ring-offset-1" : "hover:ring-1 hover:ring-stone-400"
            }`}
          >
            {w.status === "insertion" && <span aria-hidden>+ </span>}
            {w.text}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {word ? (
          <WordDetail key={word.index} word={word} result={result} />
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Select a word to see its IPA sounds, hear the reference pronunciation and replay how you said it.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ---------- full take ---------- */

function TakeAudio({ result }: { result: AssessmentResult }) {
  const blob = getTakeAudio(result.id);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  return (
    <Card>
      <CardTitle>Your take</CardTitle>
      {url ? (
        <audio controls src={url} className="w-full" />
      ) : (
        <p className="text-sm text-muted">
          {result.source === "demo"
            ? "The sample result has no audio. Record a take to replay it here."
            : "Audio is kept in memory only until you reload or close the tab, so this take can no longer be replayed. The scores are saved."}
        </p>
      )}
      {result.recognizedText && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted hover:text-ink">What was heard</summary>
          <p className="mt-2 leading-relaxed">{result.recognizedText}</p>
        </details>
      )}
    </Card>
  );
}

/* ---------- page ---------- */

export function Results() {
  const id = useSearchParams().get("session");
  const { hydrated, results } = useStore();
  const result = id ? results[id] : undefined;

  useEffect(() => () => stopPlayback(), []);

  if (!hydrated) return <Loading label="Loading result" />;
  if (!result) {
    return (
      <EmptyState
        icon={<FileQuestion className="h-8 w-8" aria-hidden />}
        title="This result is not stored"
        action={
          <>
            <Link href="/history" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium">See progress</Link>
            <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">Back to scripts</Link>
          </>
        }
      >
        Only the most recent full results are kept in the browser. Its scores are still in your progress history.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Scripts
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{result.scriptTitle}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{formatDate(result.createdAt)}</span>
            {result.source === "demo" && <Pill tone="amber">Demo: sample data</Pill>}
            {result.source === "transcript" && <Pill tone="amber">Transcript-only: no phoneme scores</Pill>}
            {result.source === "azure" && <Pill tone="accent">Azure, {result.segmentCount} {result.segmentCount === 1 ? "segment" : "segments"}</Pill>}
          </div>
        </div>
        <Link
          href={`/practice?script=${encodeURIComponent(result.scriptId)}`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#0c5a4d]"
        >
          <Mic className="h-4 w-4" aria-hidden />
          Practice again
        </Link>
      </div>

      <ScoresCard result={result} />
      <div className="grid gap-5 lg:grid-cols-2">
        <PacingCard result={result} />
        <TakeAudio result={result} />
      </div>
      <WordMap key={result.id} result={result} />
      <CoachingPanel key={`coach-${result.id}`} result={result} />
    </div>
  );
}
