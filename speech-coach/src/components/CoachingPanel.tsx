"use client";

import { MessageSquareText, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Coaching } from "@/lib/coach/schema";
import { buildLocalCoaching } from "@/lib/coach/local";
import { buildCoachSummary } from "@/lib/coach/summary";
import { toAppError } from "@/lib/errors";
import { aggregateWeakSounds, analyticsSessions } from "@/lib/history";
import { actions, useStore } from "@/lib/store";
import type { AssessmentResult } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { Button, Card, CardTitle, Notice, Pill } from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </div>
  );
}

function CoachingView({ coaching }: { coaching: Coaching }) {
  return (
    <div className="space-y-7">
      <Section title="Top priorities">
        <ol className="space-y-3">
          {coaching.priorities.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{p.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{p.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {coaching.soundFixes.length > 0 && (
        <Section title="Sound fixes">
          <ul className="grid gap-3 md:grid-cols-2">
            {coaching.soundFixes.map((fix, i) => (
              <li key={i} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ipa rounded-md bg-accent-soft px-2 py-0.5 text-lg font-semibold text-accent">{fix.sound}</span>
                  {fix.exampleWords.map((w) => (
                    <Pill key={w}>{w}</Pill>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed">{fix.instruction}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted">Minimal pair</dt>
                    <dd>
                      <span className="font-semibold">{fix.minimalPair.target}</span>
                      <span className="text-muted"> vs </span>
                      {fix.minimalPair.contrast}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted">Drill</dt>
                    <dd>{fix.drill}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {coaching.pacingNotes.length > 0 && (
        <Section title="Pacing">
          <SentenceNotes notes={coaching.pacingNotes} />
        </Section>
      )}
      {coaching.intonationNotes.length > 0 && (
        <Section title="Stress and intonation">
          <SentenceNotes notes={coaching.intonationNotes} />
        </Section>
      )}

      {coaching.rewordings.length > 0 && (
        <Section title="Say it differently">
          <ul className="space-y-3">
            {coaching.rewordings.map((r, i) => (
              <li key={i} className="rounded-xl border border-line p-4 text-sm">
                <p className="text-muted line-through decoration-stone-300">{r.original}</p>
                <p className="mt-1 font-semibold">{r.suggestion}</p>
                <p className="mt-1.5 leading-relaxed text-muted">{r.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function SentenceNotes({ notes }: { notes: { sentence: string; note: string }[] }) {
  return (
    <ul className="space-y-3">
      {notes.map((n, i) => (
        <li key={i} className="border-l-2 border-accent-soft pl-3.5">
          <p className="text-sm italic text-muted">&ldquo;{n.sentence}&rdquo;</p>
          <p className="mt-1 text-sm leading-relaxed">{n.note}</p>
        </li>
      ))}
    </ul>
  );
}

export function CoachingPanel({ result }: { result: AssessmentResult }) {
  const { anthropic } = useConfig();
  const { coaching: stored, sessions } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDemo = result.source === "demo";

  // History without this take, so "recurring" means earlier sessions.
  const summary = useMemo(() => {
    const earlier = analyticsSessions(sessions).filter((s) => s.id !== result.id);
    return buildCoachSummary(result, aggregateWeakSounds(earlier));
  }, [result, sessions]);
  // No Anthropic key: the built-in coach works from the same summary, instantly and for free.
  const builtIn = useMemo(() => (anthropic ? null : buildLocalCoaching(summary)), [anthropic, summary]);
  const usingBuiltIn = !stored[result.id] && builtIn !== null;
  const coaching = stored[result.id] ?? builtIn ?? undefined;

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      actions.saveCoaching(result.id, await api.coach(summary));
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle
        aside={
          coaching &&
          (usingBuiltIn ? (
            <Pill tone="accent">Built-in coach: free, no AI</Pill>
          ) : isDemo ? (
            <Pill tone="amber">Sample coaching, not generated live</Pill>
          ) : anthropic ? (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => void request()}>
              {!busy && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              Regenerate
            </Button>
          ) : null)
        }
      >
        Coaching
      </CardTitle>

      {error && (
        <div className="mb-4">
          <Notice tone="error" title="Coaching failed" action={<Button size="sm" onClick={() => void request()}>Try again</Button>}>
            {error}
          </Notice>
        </div>
      )}

      {coaching ? (
        <>
          <CoachingView coaching={coaching} />
          {usingBuiltIn && (
            <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">
              Written by fixed rules from your scores, on your device. Nothing was sent anywhere and it costs nothing.
              It does not suggest rewordings. An optional ANTHROPIC_API_KEY swaps in coaching written by Claude.
            </p>
          )}
        </>
      ) : busy ? (
        <div role="status" className="space-y-3 py-2" aria-label="Claude is reviewing your take">
          <p className="text-sm text-muted">Claude is reviewing your take. This usually takes 10 to 30 seconds.</p>
          {[80, 95, 60].map((w) => (
            <div key={w} className="h-3 animate-pulse rounded bg-stone-100" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        !error && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm leading-relaxed text-muted">
              Get written coaching for this take: your top three priorities, how to physically make each sound you
              missed, and pacing and intonation notes on specific sentences. A compact summary of the scores above is
              sent to Anthropic, not the audio.
            </p>
            <Button variant="primary" onClick={() => void request()}>
              <MessageSquareText className="h-4 w-4" aria-hidden />
              Get coaching
            </Button>
          </div>
        )
      )}
    </Card>
  );
}
