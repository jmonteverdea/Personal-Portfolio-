"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useLenis } from "@/hooks/useLenis";
import { toAppError } from "@/lib/errors";
import { buildExport, parseImport } from "@/lib/history";
import { soundDelta } from "@/lib/learning/bests";
import { weekRhythm } from "@/lib/learning/rhythm";
import { learning, useLearning } from "@/lib/learning/store";
import { exportableLearning, parseLearningImport } from "@/lib/learning/transfer";
import { actions, useStore } from "@/lib/store";
import { band, BAND_TEXT, Button, Delta, formatDate, Label, LinkButton, Loading, MasteryGlyph, Note, PageHeader, Plate, Sound, StateBlock } from "./ds/ui";
import { SoundMap } from "./SoundMap";
import { METRICS, TrendChart, type Metric } from "./TrendChart";

export function Progress() {
  const atlas = useAtlas();
  const { sessions, scripts, results } = useStore();
  const learn = useLearning();
  const [metric, setMetric] = useState<Metric>("overall");
  const [message, setMessage] = useState<{ tone: "quiet" | "signal"; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useLenis();

  if (!atlas.hydrated) return <Loading label="Reading your history" />;

  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const hasDemo = sessions.some((s) => s.source === "demo");
  const hasReal = sessions.some((s) => s.source !== "demo");
  const week = weekRhythm(atlas.activityDates, learn.weeklyTarget, atlas.now);

  const exportJson = () => {
    const base = buildExport(sessions.filter((s) => s.source !== "demo"), scripts.filter((s) => !s.id.startsWith("demo-")), new Date());
    const file = { ...base, learning: exportableLearning(learn) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `speech-coach-history-${base.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "quiet", text: `Exported ${base.sessions.length} takes, ${base.scripts.length} scripts and ${file.learning.drillTakes.length} drill takes.` });
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const added = actions.importHistory(parseImport(text));
      const extra = parseLearningImport(text);
      if (extra) learning.importData(extra);
      setMessage({
        tone: "quiet",
        text: `Imported ${added.sessions} new takes and ${added.scripts} new scripts${extra ? ", plus drill and ear-training history" : ""}. What you already had was kept as it is.`,
      });
    } catch (e) {
      setMessage({ tone: "signal", text: toAppError(e, "Could not read that file.").message });
    }
  };

  // Sounds that moved most on their latest take: improvements first.
  const movers = [...atlas.sounds.values()]
    .map((s) => ({ s, d: soundDelta(s.observations) }))
    .filter((m): m is { s: (typeof m)["s"]; d: NonNullable<(typeof m)["d"]> } => m.d !== null && m.d.delta !== null && Math.abs(m.d.delta) >= 4)
    .sort((a, b) => (b.d.delta ?? 0) - (a.d.delta ?? 0));
  const improved = movers.filter((m) => (m.d.delta ?? 0) > 0).slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow={`Progress${atlas.usingDemo ? " · sample data" : ""}`}
        title={
          <>
            The map of your <span className="display-italic">voice</span>.
          </>
        }
        aside={
          <>
            <Button size="sm" onClick={exportJson} disabled={!hasReal}>
              Export JSON
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              Import JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import history file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importJson(file);
                e.target.value = "";
              }}
            />
          </>
        }
      >
        Every sound you have practised, placed where it is made in the mouth. Each stage adds a ring. Everything here is stored in this browser only.
      </PageHeader>

      {message && (
        <div className="mb-8">
          <Note tone={message.tone}>{message.text}</Note>
        </div>
      )}
      {hasDemo && (
        <div className="mb-8">
          <Note>
            {hasReal ? "Sample takes are listed below but are left out of your map, trend and schedule. " : "This map is drawn from sample takes, not from you. "}
            <button
              type="button"
              onClick={() => {
                actions.removeDemo();
                learning.removeDemo();
              }}
              className="font-medium text-fg underline decoration-signal underline-offset-4 hover:text-signal"
            >
              Remove the sample data
            </button>
          </Note>
        </div>
      )}

      {sessions.length === 0 ? (
        <StateBlock kind="empty" title="The map is blank until you speak." action={<LinkButton href="/" variant="solid">Plan a first session</LinkButton>}>
          Record one take and every sound in it appears here. After a few takes you will see which sounds hold, which keep slipping and what is due for review.
        </StateBlock>
      ) : (
        <div className="space-y-12">
          <Plate caption="Sound map" aside={<Label as="span">{atlas.due.length} due for review</Label>}>
            {atlas.sounds.size === 0 ? (
              <p className="py-10 text-center text-sm text-fg-3">No sound data yet. The map is drawn from Azure sound scores, so it needs at least one scored take.</p>
            ) : (
              <SoundMap sounds={atlas.sounds} />
            )}
          </Plate>

          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Plate caption="What moved on your latest take">
              {improved.length === 0 ? (
                <p className="text-sm leading-relaxed text-fg-3">Nothing has moved by more than a few points yet. Movement shows after the second take that includes a sound.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {improved.map(({ s, d }) => (
                    <li key={s.phoneme}>
                      <Link href={`/sound?p=${encodeURIComponent(s.phoneme)}`} className="press flex items-center gap-4 py-3 hover:text-signal">
                        <MasteryGlyph level={s.level} size={24} due={s.review?.due} />
                        <Sound className="w-16 text-2xl">{s.phoneme}</Sound>
                        <span className={`font-mono text-sm tabular-nums ${BAND_TEXT[band(d.current)]}`}>{Math.round(d.current)}</span>
                        <Delta value={d.delta} />
                        {d.isBest && <span className="label ml-auto !text-good">best yet</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 border-t border-rule pt-5">
                <Label>This week</Label>
                <p className="mt-2 text-base">
                  {week.practised} of {week.target} days practised{week.met ? ". Target reached." : "."}
                </p>
              </div>
            </Plate>

            <Plate
              caption="Score trend"
              aside={
                <div className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Metric">
                  {METRICS.map((m) => (
                    <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)} className={`label press py-1 ${metric === m.key ? "!text-fg underline decoration-signal decoration-2 underline-offset-4" : "text-fg-3 hover:!text-fg"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            >
              <TrendChart sessions={atlas.sessions} metric={metric} />
            </Plate>
          </div>

          <Plate
            caption="Takes"
            flush
            aside={
              confirmClear ? (
                <span className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="signal"
                    onClick={() => {
                      actions.clearHistory();
                      learning.clear();
                      setConfirmClear(false);
                    }}
                  >
                    Delete every take and drill
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setConfirmClear(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="quiet" onClick={() => setConfirmClear(true)}>
                  Clear history
                </Button>
              )
            }
          >
            <div className="overflow-x-auto" data-lenis-prevent>
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-rule text-left">
                    {["Date", "Script", "Overall", "Acc.", "Flu.", "Pros.", "WPM", ""].map((h, i) => (
                      <th key={h || "x"} className={`label px-5 py-3 font-normal text-fg-3 sm:px-7 ${i >= 2 && i <= 6 ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {[...ordered].reverse().map((s) => {
                    const cell = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v) : "n/a");
                    return (
                      <tr key={s.id} className="hover:bg-surface">
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-fg-3 sm:px-7">{formatDate(s.date)}</td>
                        <td className="px-5 py-3.5 sm:px-7">
                          {results[s.id] ? (
                            <Link href={`/results?session=${encodeURIComponent(s.id)}`} className="underline decoration-rule-strong underline-offset-4 hover:decoration-signal">
                              {s.scriptTitle}
                            </Link>
                          ) : (
                            s.scriptTitle
                          )}
                          {s.source === "demo" && <span className="label ml-3 text-fg-3">sample</span>}
                          {s.source === "transcript" && <span className="label ml-3 text-fg-3">words only</span>}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-mono tabular-nums sm:px-7 ${s.scores ? BAND_TEXT[band(s.scores.overall)] : "text-fg-3"}`}>{cell(s.scores?.overall)}</td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-fg-2 sm:px-7">{cell(s.scores?.accuracy)}</td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-fg-2 sm:px-7">{cell(s.scores?.fluency)}</td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-fg-2 sm:px-7">{cell(s.scores?.prosody)}</td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-fg-2 sm:px-7">{cell(s.wordsPerMinute)}</td>
                        <td className="px-5 py-3.5 text-right sm:px-7">
                          <button type="button" onClick={() => actions.deleteSession(s.id)} aria-label={`Delete the take from ${formatDate(s.date)}`} className="label text-fg-3 hover:!text-signal">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-rule px-5 py-3 text-xs text-fg-3 sm:px-7">Word-by-word detail is kept for the 8 most recent takes. Older takes keep their scores and sound data.</p>
          </Plate>
        </div>
      )}
    </div>
  );
}
