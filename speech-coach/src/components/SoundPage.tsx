"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { guideFor } from "@/lib/coach/local";
import { soundDelta } from "@/lib/learning/bests";
import { contentFor, hasPairs } from "@/lib/learning/content";
import { MASTERY_NAMES, MASTERY_RULES, nextStageHint } from "@/lib/learning/mastery";
import { isRealSpeech } from "@/lib/learning/observations";
import { describeDue } from "@/lib/learning/schedule";
import { useRouter } from "next/navigation";
import { band, BAND_TEXT, Delta, formatDay, Label, LinkButton, Loading, MasteryGlyph, Plate, Sound, StateBlock } from "./ds/ui";

/** One sound: where it stands, what moves it up, and the two ways to work on it. */
export function SoundPage() {
  const router = useRouter();
  const phoneme = useSearchParams().get("p") ?? "";
  const atlas = useAtlas();
  const entry = atlas.sounds.get(phoneme);
  const reviewHref = `/session/review?p=${encodeURIComponent(phoneme)}`;
  const earHref = `/ear?p=${encodeURIComponent(phoneme)}`;
  useHotkeys({ enter: entry ? () => router.push(reviewHref) : undefined, e: entry && hasPairs(phoneme) ? () => router.push(earHref) : undefined });

  if (!atlas.hydrated) return <Loading label="Reading your history" />;
  if (!entry) {
    return (
      <StateBlock kind="empty" title="No data for that sound yet." action={<LinkButton href="/progress" variant="solid">Back to the map</LinkButton>}>
        A sound appears once a scored take contains it.
      </StateBlock>
    );
  }

  const guide = guideFor(phoneme);
  const content = contentFor(phoneme);
  const delta = soundDelta(entry.observations);
  const priority = atlas.priorities.find((p) => p.phoneme === phoneme);
  const hint = nextStageHint(entry.observations);
  const ear = atlas.earAttempts.filter((a) => a.phoneme === phoneme);
  const earTotal = ear.reduce((n, a) => n + a.rounds, 0);
  const earRight = ear.reduce((n, a) => n + a.correct, 0);
  const recent = entry.observations.slice(-14);
  const W = 640;
  const H = 150;
  const x = (i: number) => 40 + (recent.length === 1 ? (W - 60) / 2 : (i / (recent.length - 1)) * (W - 60));
  const y = (v: number) => 14 + (1 - v / 100) * (H - 40);

  return (
    <div>
      <Link href="/progress" className="label text-fg-3 hover:text-fg">
        ← Sound map
      </Link>
      <div className="mt-6 grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <p className="ipa rise text-[clamp(9rem,22vw,18rem)] leading-[0.8]" aria-label={`Sound ${phoneme}`}>
            {phoneme}
          </p>
          <div className="rise mt-10 flex items-center gap-4" style={{ "--i": 1 } as React.CSSProperties}>
            <MasteryGlyph level={entry.level} size={48} due={entry.review?.due} />
            <div>
              <p className="display text-3xl">{MASTERY_NAMES[entry.level]}</p>
              <p className="mt-1 text-sm text-fg-3">
                Stage {entry.level} of 4. {MASTERY_RULES[entry.level]}
              </p>
            </div>
          </div>
          {hint && (
            <p className="rise mt-6 max-w-md border-l-2 border-signal pl-4 text-[0.9375rem] leading-relaxed" style={{ "--i": 2 } as React.CSSProperties}>
              <span className="label mb-1 block text-fg-3">To reach {MASTERY_NAMES[Math.min(4, entry.level + 1) as 1 | 2 | 3 | 4]}</span>
              {hint}
            </p>
          )}
          <div className="rise mt-9 flex flex-wrap gap-3" style={{ "--i": 3 } as React.CSSProperties}>
            <LinkButton href={reviewHref} variant="solid" size="lg" hotkey="enter">
              Review now
            </LinkButton>
            {hasPairs(phoneme) && (
              <LinkButton href={earHref} size="lg" hotkey="E">
                Ear training
              </LinkButton>
            )}
          </div>
        </div>

        <div className="space-y-10">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
            <div>
              <dt className="label text-fg-3">Latest</dt>
              <dd className={`numeral mt-2 text-6xl ${BAND_TEXT[band(entry.latest)]}`}>{Math.round(entry.latest)}</dd>
              <dd className="mt-2 min-h-4">{delta && <Delta value={delta.delta} />}</dd>
            </div>
            <div>
              <dt className="label text-fg-3">Best</dt>
              <dd className="numeral mt-2 text-6xl">{Math.round(Math.max(...entry.observations.map((o) => o.average)))}</dd>
              <dd className="mt-2 min-h-4">{delta?.isBest && <span className="label !text-good">set on the latest take</span>}</dd>
            </div>
            <div>
              <dt className="label text-fg-3">Next review</dt>
              <dd className="display mt-3 text-2xl leading-tight">{entry.review ? describeDue(entry.review, atlas.now) : "none needed"}</dd>
              <dd className="mt-2 text-xs text-fg-3">{entry.review ? `gap now ${entry.review.intervalDays} ${entry.review.intervalDays === 1 ? "day" : "days"}` : "never been weak"}</dd>
            </div>
            <div>
              <dt className="label text-fg-3">Ear</dt>
              <dd className="display mt-3 text-2xl leading-tight">{earTotal > 0 ? `${earRight} of ${earTotal}` : "not tried"}</dd>
              <dd className="mt-2 text-xs text-fg-3">{earTotal > 0 ? "heard right" : content ? `against /${content.contrastSound}/` : "no pair set"}</dd>
            </div>
          </dl>

          <Plate caption="Every time it was heard" aside={<Label as="span">● real sentences &nbsp; ○ drills</Label>}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Scores for this sound over ${recent.length} takes, latest ${Math.round(entry.latest)}`}>
              {[60, 80].map((t) => (
                <g key={t}>
                  <line x1="0" x2={W} y1={y(t)} y2={y(t)} stroke={t === 80 ? "var(--rule-strong)" : "var(--rule)"} strokeDasharray={t === 80 ? undefined : "2 6"} />
                  <text x="0" y={y(t) - 5} className="fill-(--fg-3) font-mono" style={{ fontSize: 11 }}>
                    {t}
                  </text>
                </g>
              ))}
              {recent.length > 1 && <path d={recent.map((o, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(o.average).toFixed(1)}`).join(" ")} fill="none" stroke="var(--fg)" strokeWidth="1.25" />}
              {recent.map((o, i) => (
                <circle key={`${o.date}-${i}`} cx={x(i)} cy={y(o.average)} r="5" fill={isRealSpeech(o) ? "var(--fg)" : "var(--bg)"} stroke="var(--fg)" strokeWidth="1.5">
                  <title>{`${formatDay(o.date)}: ${Math.round(o.average)} (${o.context})`}</title>
                </circle>
              ))}
              <text x={x(0)} y={H - 4} className="label fill-(--fg-3)" style={{ fontSize: 9 }}>
                {formatDay(recent[0]!.date)}
              </text>
              {recent.length > 1 && (
                <text x={x(recent.length - 1)} y={H - 4} textAnchor="end" className="label fill-(--fg-3)" style={{ fontSize: 9 }}>
                  {formatDay(recent[recent.length - 1]!.date)}
                </text>
              )}
            </svg>
          </Plate>

          {(guide || priority) && (
            <div className="grid gap-10 sm:grid-cols-2">
              {guide && (
                <div>
                  <Label>How to make it</Label>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed">{guide.how}</p>
                  <p className="mt-3 text-sm text-fg-3">
                    Minimal pair: <span className="text-fg">{guide.pair[0]}</span> against {guide.pair[1]}
                  </p>
                </div>
              )}
              {priority && (
                <div>
                  <Label>Where it costs you</Label>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed">
                    Weak in {priority.weakSessions} of {priority.sessions} takes{priority.weakScripts > 1 ? `, across ${priority.weakScripts} scripts` : ""}.
                  </p>
                  {priority.examples.length > 0 && (
                    <p className="mt-3 text-sm text-fg-3">
                      In your words: <span className="text-fg">{priority.examples.join(", ")}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-fg-3">
            <Sound>{phoneme}</Sound> heard {entry.occurrences} times across {entry.observations.length} takes.
          </p>
        </div>
      </div>
    </div>
  );
}
