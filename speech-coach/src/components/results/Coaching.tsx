"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { buildLocalCoaching } from "@/lib/coach/local";
import type { Coaching } from "@/lib/coach/schema";
import { buildCoachSummary } from "@/lib/coach/summary";
import { toAppError } from "@/lib/errors";
import { aggregateWeakSounds, analyticsSessions } from "@/lib/history";
import { modes, useModes } from "@/lib/modes/store";
import { latestVotes, noteKey, recentDislikes } from "@/lib/modes/trust";
import { actions, newId, useStore } from "@/lib/store";
import type { AssessmentResult } from "@/lib/types";
import { useConfig } from "../ConfigContext";
import { Button, Label, StateBlock } from "../ds/ui";

/**
 * Thumbs on one note. Stored on this device only. A thumbs-down dims the note
 * and its text is sent with the next coaching request so it is not repeated.
 */
function Vote({ section, text }: { section: string; text: string }) {
  const { thumbs } = useModes();
  const key = noteKey(section, text);
  const vote = latestVotes(thumbs).get(key)?.vote ?? null;
  const cast = (next: "up" | "down") => {
    if (vote === next) modes.clearVote(key);
    else modes.vote({ id: newId("thumb"), date: new Date().toISOString(), noteKey: key, text, vote: next });
  };
  const cls = (on: boolean) => `press inline-flex h-8 w-8 items-center justify-center border ${on ? "border-fg bg-fg text-bg" : "border-rule text-fg-3 hover:border-fg hover:text-fg"}`;
  return (
    <span className="mt-3 flex items-center gap-1.5" data-vote={vote ?? "none"}>
      <button type="button" aria-pressed={vote === "up"} aria-label="This note helped" title="This helped" onClick={() => cast("up")} className={cls(vote === "up")}>
        <ThumbsUp size={14} aria-hidden />
      </button>
      <button type="button" aria-pressed={vote === "down"} aria-label="This note did not help" title="Not useful" onClick={() => cast("down")} className={cls(vote === "down")}>
        <ThumbsDown size={14} aria-hidden />
      </button>
      {vote === "down" && <span className="label ml-1 text-fg-3">Noted. The coach will stop repeating it.</span>}
    </span>
  );
}

function useDimmed(section: string, text: string): string {
  const { thumbs } = useModes();
  return latestVotes(thumbs).get(noteKey(section, text))?.vote === "down" ? "opacity-45" : "";
}

/** Wraps one note so a thumbs-down visibly quietens it. */
function Dim({ section, text, as: Tag = "div", className = "", children }: { section: string; text: string; as?: "div" | "li"; className?: string; children: React.ReactNode }) {
  const dim = useDimmed(section, text);
  return <Tag className={`${className} transition-opacity duration-200 ${dim}`}>{children}</Tag>;
}

function Notes({ notes, section }: { notes: { sentence: string; note: string }[]; section: string }) {
  return (
    <ul className="space-y-6">
      {notes.map((n, i) => (
        <li key={i} className="grid gap-x-8 gap-y-2 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <p className="display display-italic text-xl leading-snug text-fg-2">&ldquo;{n.sentence}&rdquo;</p>
          <div>
            <Dim section={section} text={n.note}>
              <p className="text-[0.9375rem] leading-relaxed">{n.note}</p>
            </Dim>
            <Vote section={section} text={n.note} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule pt-6">
      <Label as="h3" className="mb-5">
        {title}
      </Label>
      {children}
    </div>
  );
}

function CoachingView({ coaching }: { coaching: Coaching }) {
  return (
    <div className="space-y-10">
      <ol className="grid gap-8 md:grid-cols-3">
        {coaching.priorities.map((p, i) => (
          <li key={i}>
            <Dim section="priority" text={p.detail}>
              <span className="numeral text-5xl text-fg-3">{i + 1}</span>
              <p className="display mt-3 text-2xl leading-tight">{p.title}</p>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-2">{p.detail}</p>
            </Dim>
            <Vote section="priority" text={p.detail} />
          </li>
        ))}
      </ol>

      {coaching.soundFixes.length > 0 && (
        <Group title="How to make each sound">
          <ul className="divide-y divide-rule">
            {coaching.soundFixes.map((fix, i) => (
              <li key={i} className="grid gap-x-8 gap-y-3 py-6 first:pt-0 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,16rem)]">
                <div>
                  <p className={`ipa leading-none ${fix.sound.replace(/\//g, "").trim().length > 3 ? "text-2xl" : "text-5xl"}`}>{fix.sound.replace(/\//g, "")}</p>
                  <p className="mt-3 text-sm text-fg-3">{fix.exampleWords.join(", ")}</p>
                </div>
                <div>
                  <Dim section="sound" text={fix.instruction}>
                    <p className="text-[0.9375rem] leading-relaxed">{fix.instruction}</p>
                  </Dim>
                  <Vote section="sound" text={fix.instruction} />
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="label text-fg-3">Minimal pair</dt>
                    <dd className="mt-1">
                      <span className="font-medium">{fix.minimalPair.target}</span> <span className="text-fg-3">against</span> {fix.minimalPair.contrast}
                    </dd>
                  </div>
                  <div>
                    <dt className="label text-fg-3">Drill</dt>
                    <dd className="mt-1 leading-relaxed text-fg-2">{fix.drill}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </Group>
      )}
      {coaching.pacingNotes.length > 0 && (
        <Group title="Pacing">
          <Notes notes={coaching.pacingNotes} section="pacing" />
        </Group>
      )}
      {coaching.intonationNotes.length > 0 && (
        <Group title="Stress and intonation">
          <Notes notes={coaching.intonationNotes} section="intonation" />
        </Group>
      )}
      {coaching.rewordings.length > 0 && (
        <Group title="Say it differently">
          <ul className="grid gap-8 md:grid-cols-2">
            {coaching.rewordings.map((r, i) => (
              <li key={i}>
                <p className="text-sm text-fg-3 line-through decoration-rule-strong">{r.original}</p>
                <p className="display mt-2 text-2xl leading-tight">{r.suggestion}</p>
                <p className="mt-3 text-sm leading-relaxed text-fg-2">{r.reason}</p>
                <Vote section="rewording" text={r.suggestion} />
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
  );
}

/** Written coaching. Same logic as before the redesign: Claude when a key is set, the built-in coach otherwise. */
export function CoachingPanel({ result }: { result: AssessmentResult }) {
  const { anthropic } = useConfig();
  const { coaching: stored, sessions } = useStore();
  const { thumbs } = useModes();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDemo = result.source === "demo";

  // History without this take, so "recurring" means earlier sessions.
  const summary = useMemo(() => {
    const earlier = analyticsSessions(sessions).filter((s) => s.id !== result.id);
    return buildCoachSummary(result, aggregateWeakSounds(earlier));
  }, [result, sessions]);
  const builtIn = useMemo(() => (anthropic ? null : buildLocalCoaching(summary)), [anthropic, summary]);
  const usingBuiltIn = !stored[result.id] && builtIn !== null;
  const coaching = stored[result.id] ?? builtIn ?? undefined;

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      actions.saveCoaching(result.id, await api.coach(summary, recentDislikes(thumbs)));
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Label as="span">
          {usingBuiltIn ? "Built-in coach · free, no AI, nothing sent anywhere" : isDemo ? "Sample coaching · not generated live" : coaching ? "Written by Claude" : "Coaching by Claude"}
        </Label>
        {coaching && !usingBuiltIn && !isDemo && anthropic && (
          <Button size="sm" onClick={() => void request()} busy={busy}>
            Regenerate
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-8">
          <StateBlock kind="error" title="Coaching did not come back." compact action={<Button size="sm" onClick={() => void request()}>Try again</Button>}>
            {error}
          </StateBlock>
        </div>
      )}

      {coaching ? (
        <CoachingView coaching={coaching} />
      ) : busy ? (
        <div role="status" aria-label="Claude is reviewing your take" className="space-y-4">
          <p className="display text-2xl text-fg-2">Claude is reading your take.</p>
          <p className="text-sm text-fg-3">Usually 10 to 30 seconds.</p>
          {[78, 92, 61].map((w) => (
            <div key={w} className="h-px bg-rule-strong" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        !error && (
          <div className="max-w-xl">
            <p className="text-base leading-relaxed text-fg-2">
              Three priorities, how to physically make each sound you missed, and notes on specific sentences. A compact summary of the scores is sent to Anthropic. The audio is not.
            </p>
            <div className="mt-6">
              <Button variant="solid" onClick={() => void request()}>
                Get coaching
              </Button>
            </div>
          </div>
        )
      )}
      {usingBuiltIn && <p className="mt-10 border-t border-rule pt-5 text-xs leading-relaxed text-fg-3">Written by fixed rules from your scores, on your device. It does not suggest rewordings. An optional ANTHROPIC_API_KEY swaps in coaching written by Claude.</p>}
    </div>
  );
}
