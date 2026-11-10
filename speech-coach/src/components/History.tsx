"use client";

import { Download, LineChart, Target, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { builtInDrill } from "@/lib/drills";
import { toAppError } from "@/lib/errors";
import { aggregateWeakSounds, analyticsSessions, buildExport, parseImport, WEAK_SOUND_BELOW } from "@/lib/history";
import { actions, useStore } from "@/lib/store";
import type { WeakSound } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { METRICS, TrendChart, type Metric } from "./TrendChart";
import { Button, Card, CardTitle, EmptyState, formatDate, Loading, Notice, Pill, scoreTone } from "./ui";

const MAX_WEAK_SOUNDS = 10;

function WeakSounds({ sounds }: { sounds: WeakSound[] }) {
  const router = useRouter();
  const { anthropic } = useConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const drill = async (sound: WeakSound) => {
    setBusy(sound.phoneme);
    setError(null);
    try {
      let draft: { title: string; script: string } | null = null;
      if (anthropic) {
        try {
          draft = await api.drill(sound.phoneme, sound.examples);
        } catch (e) {
          draft = builtInDrill(sound.phoneme);
          if (!draft) throw e;
        }
      } else {
        draft = builtInDrill(sound.phoneme);
      }
      if (!draft) {
        setError(`There is no built-in drill for /${sound.phoneme}/. Add ANTHROPIC_API_KEY to generate drills for any sound.`);
        return;
      }
      const script = actions.saveScript({ title: draft.title, text: draft.script, tags: ["drill"] });
      router.push(`/practice?script=${encodeURIComponent(script.id)}`);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(null);
    }
  };

  if (sounds.length === 0) {
    return (
      <p className="text-sm text-muted">
        No phoneme data yet. Weak sounds are ranked from Azure phoneme scores, so they need at least one scored take.
      </p>
    );
  }

  const weak = sounds.filter((s) => s.averageAccuracy < WEAK_SOUND_BELOW);
  const shown = (weak.length > 0 ? weak : sounds).slice(0, MAX_WEAK_SOUNDS);

  return (
    <div className="space-y-3">
      {weak.length === 0 && (
        <p className="text-sm text-muted">No sound averages under {WEAK_SOUND_BELOW}. These are your lowest anyway.</p>
      )}
      {error && <Notice tone="error" title="Could not build the drill">{error}</Notice>}
      <ol className="divide-y divide-line">
        {shown.map((s, i) => {
          const tone = scoreTone(s.averageAccuracy);
          return (
            <li key={s.phoneme} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="w-5 text-sm tabular-nums text-muted">{i + 1}</span>
              <span className="ipa w-16 text-xl font-semibold">/{s.phoneme}/</span>
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${s.averageAccuracy}%` }} />
                  </div>
                  <span className={`w-8 text-right text-sm font-semibold tabular-nums ${tone.text}`}>{Math.round(s.averageAccuracy)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {s.lowCount} of {s.occurrences} missed, weak in {s.weakSessions} of {s.sessions} {s.sessions === 1 ? "session" : "sessions"}
                  {s.examples.length > 0 && <> · {s.examples.join(", ")}</>}
                </p>
              </div>
              <Button size="sm" loading={busy === s.phoneme} disabled={busy !== null} onClick={() => void drill(s)}>
                {busy !== s.phoneme && <Target className="h-3.5 w-3.5" aria-hidden />}
                Drill this sound
              </Button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">
        {anthropic
          ? "Drills are written by Claude around the words you missed."
          : "No Anthropic key: drills come from a built-in set for common problem sounds."}
      </p>
    </div>
  );
}

export function History() {
  const { hydrated, sessions, scripts, results } = useStore();
  const [metric, setMetric] = useState<Metric>("overall");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!hydrated) return <Loading label="Loading your history" />;

  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const counted = analyticsSessions(ordered);
  const hasDemo = sessions.some((s) => s.source === "demo");
  const hasReal = sessions.some((s) => s.source !== "demo");
  const weakSounds = aggregateWeakSounds(counted);

  const exportJson = () => {
    const data = buildExport(sessions.filter((s) => s.source !== "demo"), scripts.filter((s) => !s.id.startsWith("demo-")), new Date());
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `speech-coach-history-${data.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "info", text: `Exported ${data.sessions.length} sessions and ${data.scripts.length} scripts.` });
  };

  const importJson = async (file: File) => {
    try {
      const added = actions.importHistory(parseImport(await file.text()));
      setMessage({ tone: "info", text: `Imported ${added.sessions} new sessions and ${added.scripts} new scripts. Entries you already had were kept as they are.` });
    } catch (e) {
      setMessage({ tone: "error", text: toAppError(e, "Could not read that file.").message });
    }
  };

  const tools = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={exportJson} disabled={!hasReal}>
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export JSON
      </Button>
      <Button size="sm" onClick={() => fileRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" aria-hidden />
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
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-muted">Every take is saved in this browser. Nothing here leaves your machine.</p>
        </div>
        {tools}
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {hasDemo && (
        <Notice
          tone="warn"
          title="Demo data is loaded"
          action={<Button size="sm" onClick={() => actions.removeDemo()}>Remove demo data</Button>}
        >
          {hasReal
            ? "Sample sessions are listed below but are left out of your trend and weak-sound ranking."
            : "The trend and weak sounds below come from sample sessions, not from you."}
        </Notice>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          icon={<LineChart className="h-8 w-8" aria-hidden />}
          title="No sessions yet"
          action={
            <Link href="/" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">Pick a script to practice</Link>
          }
        >
          Record a take and it shows up here with its scores. After a few takes you will see your trend and which sounds
          keep causing trouble.
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardTitle
              aside={
                <div className="flex flex-wrap gap-1" role="group" aria-label="Metric">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      aria-pressed={metric === m.key}
                      onClick={() => setMetric(m.key)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${metric === m.key ? "bg-ink text-white" : "text-muted hover:bg-stone-100"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              }
            >
              Score trend
            </CardTitle>
            <TrendChart sessions={counted} metric={metric} />
          </Card>

          <Card>
            <CardTitle aside={<span className="text-xs text-muted">Across {counted.length} {counted.length === 1 ? "session" : "sessions"}, weakest first</span>}>
              Recurring weak sounds
            </CardTitle>
            <WeakSounds sounds={weakSounds} />
          </Card>

          <Card>
            <CardTitle
              aside={
                confirmClear ? (
                  <span className="flex items-center gap-2">
                    <Button size="sm" variant="danger" onClick={() => { actions.clearHistory(); setConfirmClear(false); }}>Delete all sessions</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Keep</Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Clear history
                  </Button>
                )
              }
            >
              Sessions
            </CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Script</th>
                    <th className="pb-2 text-right font-medium">Overall</th>
                    <th className="pb-2 text-right font-medium">Acc.</th>
                    <th className="pb-2 text-right font-medium">Flu.</th>
                    <th className="pb-2 text-right font-medium">Pros.</th>
                    <th className="pb-2 text-right font-medium">WPM</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...ordered].reverse().map((s) => {
                    const cell = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v) : "n/a");
                    return (
                      <tr key={s.id}>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{formatDate(s.date)}</td>
                        <td className="py-2.5 pr-3">
                          {results[s.id] ? (
                            <Link href={`/results?session=${encodeURIComponent(s.id)}`} className="font-medium underline decoration-stone-300 underline-offset-2 hover:decoration-accent">
                              {s.scriptTitle}
                            </Link>
                          ) : (
                            s.scriptTitle
                          )}{" "}
                          {s.source === "demo" && <Pill tone="amber">demo</Pill>}
                          {s.source === "transcript" && <Pill>transcript-only</Pill>}
                        </td>
                        <td className={`py-2.5 text-right font-semibold tabular-nums ${s.scores ? scoreTone(s.scores.overall).text : "text-muted"}`}>{cell(s.scores?.overall)}</td>
                        <td className="py-2.5 text-right tabular-nums">{cell(s.scores?.accuracy)}</td>
                        <td className="py-2.5 text-right tabular-nums">{cell(s.scores?.fluency)}</td>
                        <td className="py-2.5 text-right tabular-nums">{cell(s.scores?.prosody)}</td>
                        <td className="py-2.5 text-right tabular-nums">{cell(s.wordsPerMinute)}</td>
                        <td className="py-2.5 pl-2 text-right">
                          <button type="button" onClick={() => actions.deleteSession(s.id)} aria-label={`Delete session from ${formatDate(s.date)}`} className="rounded p-1 text-muted hover:bg-stone-100 hover:text-rose-700">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">Full word-by-word results are kept for the 8 most recent takes. Older takes keep their scores and sound stats.</p>
          </Card>
        </>
      )}
    </div>
  );
}
