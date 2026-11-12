"use client";

import { useEffect, useMemo } from "react";
import { getTakeAudio } from "@/lib/store";
import type { AssessmentResult } from "@/lib/types";
import { bare, Label } from "../ds/ui";

/** Pace and pauses, drawn as a timeline of the take: each tick is a word, each gap is silence. */
export function Pacing({ result }: { result: AssessmentResult }) {
  const { pacing, words } = result;
  const wpm = pacing.wordsPerMinute;
  const verdict = wpm === null ? null : wpm < 120 ? "On the slow side" : wpm <= 170 ? "A comfortable pace" : "Fast";
  const timed = words.filter((w) => w.offsetMs !== null && w.durationMs !== null);
  const start = timed[0]?.offsetMs ?? 0;
  const lastWord = timed[timed.length - 1];
  const end = lastWord ? (lastWord.offsetMs ?? 0) + (lastWord.durationMs ?? 0) : 1;
  const span = Math.max(1, end - start);

  return (
    <div className="grid gap-x-12 gap-y-8 md:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <p className="numeral text-[6rem]">{wpm ?? "n/a"}</p>
        <Label className="mt-2">words per minute{pacing.estimated ? " · estimate" : ""}</Label>
        {verdict && <p className="mt-4 text-base">{verdict}.</p>}
        <p className="mt-1 max-w-56 text-sm leading-relaxed text-fg-3">
          {pacing.estimated ? "From total recording time, including silence at both ends." : "Clear work speech usually sits between 130 and 160."}
        </p>
      </div>
      <div>
        <Label as="h3">Long pauses{pacing.longPauses && ` · ${(pacing.longPauseThresholdMs / 1000).toFixed(1)}s or more`}</Label>
        {pacing.longPauses === null ? (
          <p className="mt-4 text-sm text-fg-3">Pause detection needs Azure word timing. It is not available in transcript-only mode.</p>
        ) : (
          <>
            {timed.length > 1 && (
              <svg viewBox="0 0 1000 56" className="mt-5 w-full" role="img" aria-label={`Timeline of the take: ${timed.length} words over ${(span / 1000).toFixed(0)} seconds, ${pacing.longPauses.length} long pauses`} preserveAspectRatio="none">
                <line x1="0" x2="1000" y1="28" y2="28" stroke="var(--rule)" strokeWidth="1" />
                {pacing.longPauses.map((p) => {
                  const a = words[p.afterWordIndex];
                  const b = words[p.beforeWordIndex];
                  if (!a || !b || a.offsetMs === null || a.durationMs === null || b.offsetMs === null) return null;
                  const x1 = ((a.offsetMs + a.durationMs - start) / span) * 1000;
                  const x2 = ((b.offsetMs - start) / span) * 1000;
                  return <rect key={p.afterWordIndex} x={x1} width={Math.max(2, x2 - x1)} y="14" height="28" fill={p.atSentenceBoundary ? "var(--rule)" : "var(--signal-soft)"} stroke={p.atSentenceBoundary ? "none" : "var(--signal)"} strokeWidth="1" />;
                })}
                {timed.map((w) => {
                  const x = (((w.offsetMs ?? 0) - start) / span) * 1000;
                  const width = Math.max(1.5, ((w.durationMs ?? 0) / span) * 1000 - 1.5);
                  return <rect key={w.index} x={x} width={width} y="22" height="12" fill="var(--fg)" />;
                })}
              </svg>
            )}
            {pacing.longPauses.length === 0 ? (
              <p className="mt-4 text-sm text-fg-2">None. You kept moving.</p>
            ) : (
              <ul className="mt-5 divide-y divide-rule border-y border-rule">
                {pacing.longPauses.map((p) => (
                  <li key={p.afterWordIndex} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                    <span className="font-mono text-sm tabular-nums">{(p.durationMs / 1000).toFixed(1)}s</span>
                    <span className="flex-1 text-base">
                      {bare(words[p.afterWordIndex]?.text ?? "")} <span className="text-fg-3">…</span> {bare(words[p.beforeWordIndex]?.text ?? "")}
                    </span>
                    <span className={`label ${p.atSentenceBoundary ? "text-fg-3" : "!text-signal"}`}>{p.atSentenceBoundary ? "between sentences" : "mid-sentence"}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function TakeAudio({ result }: { result: AssessmentResult }) {
  const blob = getTakeAudio(result.id);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div className="max-w-2xl">
      {url ? (
        <audio controls src={url} className="w-full" />
      ) : (
        <p className="text-base leading-relaxed text-fg-2">
          {result.source === "demo"
            ? "The sample take has no audio. Record a take to replay it here."
            : "The recording is kept in memory only until the page reloads, so this take can no longer be replayed. Its scores are saved."}
        </p>
      )}
      {result.recognizedText && (
        <div className="mt-8">
          <Label as="h3">What was heard</Label>
          <p className="mt-3 text-base leading-relaxed text-fg-2">{result.recognizedText}</p>
        </div>
      )}
    </div>
  );
}
