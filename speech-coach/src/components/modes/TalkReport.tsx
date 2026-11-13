"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { guideFor } from "@/lib/coach/local";
import { analyzeDelivery, RAMBLING_WORDS, scanTokens, type DeliveryReport } from "@/lib/modes/delivery";
import { PACE_TARGET } from "@/lib/modes/event";
import { useModes } from "@/lib/modes/store";
import type { TalkRecord } from "@/lib/modes/types";
import { normalizeWord, splitWords } from "@/lib/text";
import { formatClock, formatDate, Label, LinkButton, Loading, Note, Plate, Sound, StateBlock } from "../ds/ui";
import { Rewording } from "./Rewording";
import { SaveWord } from "./SaveWord";

interface Finding {
  title: string;
  detail: string;
}

/** What held up, said first. Only things that are actually true of this talk. */
function strengths(r: DeliveryReport): string[] {
  const out: string[] = [];
  if (r.wordsPerMinute !== null && r.wordsPerMinute >= PACE_TARGET.min && r.wordsPerMinute <= PACE_TARGET.max) out.push(`Pace of ${r.wordsPerMinute} words a minute, inside the clear range.`);
  if (r.fillersPerMinute !== null && r.fillersPerMinute < 2) out.push(r.fillerTotal === 0 ? "No filler words." : "Few filler words.");
  if (r.longPauses !== null && r.longPauses.length === 0) out.push("No long pauses: you kept moving.");
  if (r.rambling.length === 0 && r.sentenceCount > 1) out.push(`Sentences stayed short, ${r.averageSentence} words on average.`);
  if (r.hedgeTotal === 0) out.push("You stated things plainly, with no hedging.");
  return out;
}

/** The one thing to work on: the delivery habit that costs a listener most in this talk. */
function mainFinding(r: DeliveryReport): Finding | null {
  if (r.rambling.length > 0 && r.longestSentence) {
    return { title: "Land the sentence sooner.", detail: `Your longest sentence ran to ${r.longestSentence.words} words. Listeners lose the thread past about ${RAMBLING_WORDS}. Say the point, stop, then add the reason as a new sentence.` };
  }
  const top = r.fillers[0];
  if (top && r.fillersPerMinute !== null && r.fillersPerMinute >= 4) {
    return { title: `Swap “${top.text}” for a pause.`, detail: `${r.fillerTotal} fillers, about ${r.fillersPerMinute} a minute, and “${top.text}” was ${top.count} of them. A silent beat sounds more confident than a sound, and it gives you the same time to think.` };
  }
  const hedge = r.hedges[0];
  if (hedge && r.hedgeTotal >= 3) {
    return { title: "Say it without the cushion.", detail: `You softened ${r.hedgeTotal} statements, most often with “${hedge.text}”. In a meeting that reads as doubt. State the point, and add your uncertainty only where it is real.` };
  }
  if (r.wordsPerMinute !== null && r.wordsPerMinute > 170) return { title: "Slow down.", detail: `${r.wordsPerMinute} words a minute is fast for a listener, and speed is where final consonants go missing. Add a full beat at each full stop.` };
  if (r.wordsPerMinute !== null && r.wordsPerMinute < 110 && !r.paceEstimated) return { title: "Pick up the pace.", detail: `${r.wordsPerMinute} words a minute sounds hesitant. Link the words inside each phrase and keep the pauses for the ends of sentences.` };
  if (r.longPauses && r.longPauses.length >= 2) {
    const worst = [...r.longPauses].sort((a, b) => b.ms - a.ms)[0]!;
    return { title: "Pause at the full stop, not before the word.", detail: `${r.longPauses.length} long pauses, the longest ${(worst.ms / 1000).toFixed(1)} seconds between “${worst.after}” and “${worst.before}”. Finish the phrase, then breathe.` };
  }
  if (top && r.fillerTotal >= 2) return { title: `Swap “${top.text}” for a pause.`, detail: `“${top.text}” came up ${top.count} times. A silent beat does the same job.` };
  if (hedge) return { title: "Say it without the cushion.", detail: `You softened a statement with “${hedge.text}”. Try it plainly.` };
  return null;
}

/** The talk as a strip: my speaking time, with every filler and long pause marked where it happened. */
function Timeline({ talk, report }: { talk: TalkRecord; report: DeliveryReport }) {
  const total = Math.max(1, report.speakingMs);
  const fillerMarks = report.fillers.flatMap((f) => f.atMs.map((at) => ({ at, text: f.text })));
  const mine = talk.turns.filter((t) => t.role === "me");
  const bounds = mine.reduce<{ start: number; end: number }[]>((all, t) => {
    const start = all[all.length - 1]?.end ?? 0;
    return [...all, { start, end: start + t.durationMs }];
  }, []);
  if (fillerMarks.length === 0 && !report.longPauses?.length) return null;
  return (
    <figure>
      <svg viewBox="0 0 1000 70" className="w-full" preserveAspectRatio="none" role="img" aria-label={`Timeline of ${formatClock(total)} of speaking with ${fillerMarks.length} fillers and ${report.longPauses?.length ?? 0} long pauses marked`}>
        {bounds.map((b, i) => (
          <rect key={i} x={(b.start / total) * 1000 + 1} width={Math.max(2, ((b.end - b.start) / total) * 1000 - 2)} y="30" height="10" fill="var(--rule-strong)" />
        ))}
        {(report.longPauses ?? []).map((p, i) => (
          <rect key={`p${i}`} x={(p.atMs / total) * 1000} width={Math.max(3, (p.ms / total) * 1000)} y="22" height="26" fill="var(--bg)" stroke="var(--fg)" strokeWidth="1" strokeDasharray="2 3" />
        ))}
        {fillerMarks.map((f, i) => (
          <line key={`f${i}`} x1={(f.at / total) * 1000} x2={(f.at / total) * 1000} y1="8" y2="62" stroke="var(--signal)" strokeWidth="2" />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        <span className="label text-fg-3">0:00</span>
        <span className="label !text-signal">| filler</span>
        <span className="label text-fg-3">┆ long pause</span>
        <span className="label ml-auto text-fg-3">{formatClock(total)}</span>
      </figcaption>
    </figure>
  );
}

function Figure({ value, label, note }: { value: string | number; label: string; note?: string }) {
  return (
    <div>
      <dd className="numeral text-6xl">{value}</dd>
      <dt className="label mt-3 text-fg-3">{label}</dt>
      {note && <p className="mt-1 text-xs text-fg-3">{note}</p>}
    </div>
  );
}

/** My words with fillers and hedges marked, so I can see them in what I actually said. */
function Marked({ text }: { text: string }) {
  const raw = splitWords(text);
  const tokens = raw.map((w) => ({ norm: normalizeWord(w), atMs: null }));
  const flags = new Array<"filler" | "hedge" | null>(raw.length).fill(null);
  const mark = (phrases: Iterable<string>, kind: "filler" | "hedge") => {
    for (const phrase of phrases) {
      const parts = phrase.split(" ");
      for (let i = 0; i + parts.length <= tokens.length; i++) {
        if (parts.every((p, k) => tokens[i + k]?.norm === p && flags[i + k] === null)) parts.forEach((_, k) => (flags[i + k] = kind));
      }
    }
  };
  const found = scanTokens(tokens);
  mark([...found.hedges.keys()].sort((a, b) => b.length - a.length), "hedge");
  mark(found.fillers.keys(), "filler");
  return (
    <>
      {raw.map((word, i) => (
        <span key={i}>
          <span className={flags[i] === "filler" ? "w-poor" : flags[i] === "hedge" ? "w-fair" : undefined}>{word}</span>{" "}
        </span>
      ))}
    </>
  );
}

export function TalkReport() {
  const id = useSearchParams().get("id");
  const { hydrated, talks } = useModes();
  const talk = talks.find((t) => t.id === id);
  const report = useMemo(() => (talk ? analyzeDelivery(talk.turns) : null), [talk]);

  if (!hydrated) return <Loading label="Reading the talk" />;
  if (!talk || !report) {
    return (
      <StateBlock kind="empty" title="That talk is not stored." action={<LinkButton href="/speak" variant="solid">Back to Speak</LinkButton>}>
        Only the most recent talks are kept.
      </StateBlock>
    );
  }

  const good = strengths(report);
  const finding = mainFinding(report);
  const myTurns = talk.turns.filter((t) => t.role === "me");
  const scored = myTurns.filter((t) => t.scores !== null);
  const mean = (pick: (t: (typeof scored)[number]) => number | null | undefined) => {
    const values = scored.map(pick).filter((v): v is number => typeof v === "number");
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  };
  const lowWords = myTurns
    .flatMap((t) => t.words)
    .filter((w) => w.accuracy !== null && w.accuracy < 60 && w.worst && guideFor(w.worst.phoneme))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .filter((w, i, all) => all.findIndex((o) => o.text === w.text) === i)
    .slice(0, 5);

  return (
    <div>
      <header className="mb-10">
        <Link href="/speak" className="label text-fg-3 hover:text-fg">
          ← Speak
        </Link>
        <h1 className="display mt-3 text-(length:--text-display-s)">{talk.title}</h1>
        <Label className="mt-3">
          {formatDate(talk.date)} · {talk.kind === "free" ? "Free talk" : "Conversation"} · delivery report
          {talk.source === "demo" ? " · sample data" : talk.source === "transcript" ? " · transcript-only" : ""}
        </Label>
      </header>

      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <section>
          <Label>What held up</Label>
          {good.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {good.map((g) => (
                <li key={g} className="flex gap-3 text-[0.9375rem] leading-relaxed">
                  <span className="text-good" aria-hidden>
                    ✓
                  </span>
                  {g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-fg-3">Nothing stands out as a strength yet. That changes fast with practice.</p>
          )}
        </section>
        <section>
          <Label className="!text-signal">The one thing to work on</Label>
          {finding ? (
            <>
              <h2 className="display mt-3 text-(length:--text-display-m)">{finding.title}</h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed">{finding.detail}</p>
            </>
          ) : (
            <>
              <h2 className="display mt-3 text-(length:--text-display-m)">Nothing stands out.</h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fg-2">No fillers, hedges, long pauses or run-on sentences worth flagging. Try a harder scenario.</p>
            </>
          )}
        </section>
      </div>

      <dl className="mt-14 grid grid-cols-2 gap-x-8 gap-y-10 border-y border-rule py-10 sm:grid-cols-3 lg:grid-cols-5">
        <Figure value={report.wordsPerMinute ?? "n/a"} label={`Words a minute${report.paceEstimated ? " · estimate" : ""}`} note={`clear range ${PACE_TARGET.min} to ${PACE_TARGET.max}`} />
        <Figure value={report.fillerTotal} label="Fillers" note={report.fillersPerMinute !== null ? `${report.fillersPerMinute} a minute` : undefined} />
        <Figure value={report.hedgeTotal} label="Hedges" />
        <Figure value={report.longPauses === null ? "n/a" : report.longPauses.length} label="Long pauses" note={report.longPauses === null ? "needs Azure word timing" : "0.7 s or more"} />
        <Figure value={report.longestSentence?.words ?? 0} label="Longest sentence" note={`average ${report.averageSentence} words`} />
      </dl>

      <div className="mt-10">
        <Timeline talk={talk} report={report} />
      </div>

      <div className="mt-14">
        <Rewording talk={talk} weakestTurn={report.weakestTurn} />
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <Plate caption="Fillers and hedges" flush>
          {report.fillers.length + report.hedges.length === 0 ? (
            <p className="px-5 py-6 text-sm text-fg-3 sm:px-7">None found.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {[...report.fillers.map((f) => ({ ...f, kind: "filler" })), ...report.hedges.map((h) => ({ ...h, kind: "hedge" }))].map((item) => (
                <li key={`${item.kind}-${item.text}`} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-5 py-3 sm:px-7">
                  <span className="font-mono text-sm tabular-nums">{item.count}×</span>
                  <span className={`flex-1 text-lg ${item.kind === "filler" ? "w-poor" : "w-fair"}`}>{item.text}</span>
                  <span className="label text-fg-3">{item.kind}</span>
                  {item.atMs.length > 0 && <span className="w-full font-mono text-xs text-fg-3 sm:w-auto">{item.atMs.slice(0, 6).map((ms) => formatClock(ms)).join("  ")}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-rule px-5 py-3 text-xs leading-relaxed text-fg-3 sm:px-7">
            Speech recognition drops some “um” and “uh” sounds before they reach the transcript, so the real count can be higher. “Like” is counted only where it looks like a filler.
          </p>
        </Plate>

        <Plate caption="Sentences and repeats">
          <dl className="space-y-5 text-[0.9375rem]">
            <div>
              <dt className="label text-fg-3">Longest sentence · {report.longestSentence?.words ?? 0} words</dt>
              <dd className={`mt-1.5 leading-relaxed ${report.rambling.length ? "" : "text-fg-2"}`}>{report.longestSentence?.text ?? "None."}</dd>
            </div>
            <div>
              <dt className="label text-fg-3">Said twice in a row</dt>
              <dd className="mt-1.5">{report.immediateRepeats.length ? report.immediateRepeats.map((r) => `“${r.text} ${r.text}”${r.count > 1 ? ` ×${r.count}` : ""}`).join(", ") : <span className="text-fg-2">Nothing.</span>}</dd>
            </div>
            <div>
              <dt className="label text-fg-3">Words you leaned on</dt>
              <dd className="mt-1.5">{report.overused.length ? report.overused.map((o) => `${o.text} ×${o.count}`).join(", ") : <span className="text-fg-2">No word was overused.</span>}</dd>
            </div>
            {report.longPauses && report.longPauses.length > 0 && (
              <div>
                <dt className="label text-fg-3">Long pauses</dt>
                <dd className="mt-1.5">
                  {report.longPauses.map((p, i) => (
                    <span key={i} className="mr-4 inline-block">
                      <span className="font-mono text-xs text-fg-3">{formatClock(p.atMs)}</span> {p.after} <span className="text-fg-3">… {(p.ms / 1000).toFixed(1)}s …</span> {p.before}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </Plate>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Plate caption="What you said" aside={<Label as="span">fillers and hedges marked</Label>}>
          <div className="space-y-5">
            {talk.turns.map((turn, i) =>
              turn.role === "partner" ? (
                <p key={i} className="text-sm text-fg-3">
                  <span className="label mr-3 !text-model">Them</span>
                  {turn.text}
                </p>
              ) : (
                <p key={i} className={`border-l pl-4 text-lg leading-relaxed ${report.weakestTurn === i ? "border-signal" : "border-rule-strong"}`}>
                  <Marked text={turn.text} />
                </p>
              ),
            )}
          </div>
        </Plate>

        <Plate caption="Sounds" aside={<Label as="span">less precise than scripted scores</Label>}>
          {scored.length === 0 ? (
            <p className="text-sm leading-relaxed text-fg-3">No sound scores for this talk. They need Azure Speech, and nothing is estimated without it.</p>
          ) : (
            <>
              <dl className="flex gap-8">
                {[
                  ["Accuracy", mean((t) => t.scores?.accuracy)],
                  ["Fluency", mean((t) => t.scores?.fluency)],
                  ["Prosody", mean((t) => t.scores?.prosody)],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dd className="numeral text-4xl">{value ?? "n/a"}</dd>
                    <dt className="label mt-2 text-fg-3">{label}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-5">
                <Note>With no script to compare against, Azure first has to guess your words, and then scores them. Treat these as a rough guide. A scripted take or the baseline scan is the precise measure.</Note>
              </div>
              {lowWords.length > 0 && (
                <ul className="mt-6 divide-y divide-rule border-t border-rule">
                  {lowWords.map((w) => (
                    <li key={w.text} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <span className="w-poor text-lg">{w.text}</span>
                      {w.worst && (
                        <Link href={`/sound?p=${encodeURIComponent(w.worst.phoneme)}`} className="text-sm text-fg-2 hover:text-signal">
                          <Sound>{w.worst.phoneme}</Sound>
                          {w.worst.heardAs && (
                            <>
                              {" "}
                              heard as <Sound>{w.worst.heardAs}</Sound>
                            </>
                          )}
                        </Link>
                      )}
                      <span className="ml-auto">
                        <SaveWord word={w.text} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Plate>
      </div>
    </div>
  );
}
