"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";
import { alignTime, pitchPerWord, toSemitones, type Contour, type StressGap, type TimedWord } from "@/lib/modes/pitch";

/**
 * Two voices over one line of words. The model in blue, mine in red, each
 * drawn relative to its own middle pitch so only the movement shows. My line
 * is stretched word by word onto the model's timing, so both sit over the
 * same words whatever speed I spoke at.
 */

const W = 1000;
const H = 320;
const TOP = 28;
const BOTTOM = 232;
const LEFT = 44;
const RIGHT = 16;
/** Semitones shown above and below each speaker's middle pitch. */
const SPAN = 8;

function pathOf(points: { x: number; y: number | null }[]): string {
  let d = "";
  let pen = false;
  let last = -Infinity;
  for (const p of points) {
    if (p.y === null) {
      pen = false;
      continue;
    }
    // Lift the pen across silence instead of drawing a line through it.
    d += `${pen && p.x - last < 26 ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    pen = true;
    last = p.x;
  }
  return d.trim();
}

export function ContourPlot({
  model,
  mine,
  modelWords,
  myWords,
  gaps = [],
  animateKey,
}: {
  model: Contour | null;
  mine: Contour | null;
  modelWords: TimedWord[];
  myWords: TimedWord[];
  gaps?: StressGap[];
  /** Changes when a new take arrives, to draw the lines in once. */
  animateKey: string;
}) {
  const root = useRef<SVGSVGElement>(null);
  // The model's clock is the x axis when there is a model. Otherwise mine is.
  const base = model ?? mine;
  const baseWords = model ? modelWords : myWords;
  const endMs = Math.max(baseWords[baseWords.length - 1]?.endMs ?? 0, base?.timesMs[base.timesMs.length - 1] ?? 0, 1);
  const x = (ms: number) => LEFT + (ms / endMs) * (W - LEFT - RIGHT);
  const y = (st: number) => TOP + (1 - (Math.max(-SPAN, Math.min(SPAN, st)) + SPAN) / (2 * SPAN)) * (BOTTOM - TOP);

  const line = (contour: Contour | null, warp: boolean): string => {
    if (!contour) return "";
    const st = toSemitones(contour);
    return pathOf(contour.timesMs.map((t, i) => ({ x: x(warp ? alignTime(t, myWords, modelWords) : t), y: st[i] == null ? null : y(st[i] as number) })));
  };
  const modelPath = line(model, false);
  const myPath = line(mine, model !== null && myWords.length > 0 && myWords.length === modelWords.length);
  const modelPerWord = model ? pitchPerWord(model, modelWords) : [];
  const peak = modelPerWord.reduce<number | null>((best, v, i) => (v !== null && (best === null || v > (modelPerWord[best] as number)) ? i : best), null);
  const gapAt = new Map(gaps.map((g) => [g.index, g]));

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      // A result has arrived: draw the model first, then mine over it. Then it holds still.
      gsap.set("[data-line]", { strokeDashoffset: 1 });
      gsap.set("[data-mark]", { opacity: 0 });
      gsap.timeline({ defaults: { ease: "power2.inOut" } }).to("[data-line='model']", { strokeDashoffset: 0, duration: 0.9 }).to("[data-line='mine']", { strokeDashoffset: 0, duration: 1.1 }, "-=0.3").to("[data-mark]", { opacity: 1, duration: 0.4, stagger: 0.08 }, "-=0.2");
    }, el);
    return () => ctx.revert();
  }, [animateKey]);

  const describe = `Pitch over the sentence. ${model ? "Model in blue. " : ""}${mine ? "Yours in red. " : ""}${gaps.map((g) => `On “${g.word}” ${g.gap > 0 ? "go higher" : "go lower"}.`).join(" ")}`;

  return (
    <svg ref={root} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={describe}>
      {/* the staff: middle pitch and two guides either side */}
      {[-6, -3, 0, 3, 6].map((st) => (
        <g key={st}>
          <line x1={LEFT} x2={W - RIGHT} y1={y(st)} y2={y(st)} stroke={st === 0 ? "var(--rule-strong)" : "var(--rule)"} strokeWidth="1" strokeDasharray={st === 0 ? undefined : "2 7"} />
          <text x={LEFT - 10} y={y(st) + 4} textAnchor="end" className="fill-(--fg-3) font-mono" style={{ fontSize: 11 }}>
            {st > 0 ? `+${st}` : st}
          </text>
        </g>
      ))}
      <text x={LEFT} y={14} className="label fill-(--fg-3)" style={{ fontSize: 10 }}>
        higher
      </text>
      <text x={LEFT} y={BOTTOM + 14} className="label fill-(--fg-3)" style={{ fontSize: 10 }}>
        lower · semitones from each voice&rsquo;s own middle
      </text>

      {/* the words, each in its own column */}
      {baseWords.map((w, i) => {
        const gap = gapAt.get(i);
        const mid = (x(w.startMs) + x(w.endMs)) / 2;
        return (
          <g key={`${w.text}-${i}`}>
            <line x1={x(w.startMs)} x2={x(w.startMs)} y1={TOP} y2={BOTTOM} stroke="var(--rule)" strokeWidth="1" opacity="0.6" />
            {gap && <rect data-mark x={x(w.startMs)} width={Math.max(4, x(w.endMs) - x(w.startMs))} y={TOP} height={BOTTOM - TOP} fill="var(--signal)" opacity="0.09" />}
            <text x={mid} y={BOTTOM + 44} textAnchor="middle" className={gap ? "fill-(--signal)" : "fill-(--fg)"} style={{ fontFamily: "var(--font-display)", fontSize: baseWords.length > 9 ? 19 : 25, fontWeight: i === peak ? 600 : 400 }}>
              {w.text}
            </text>
            {gap && (
              <text data-mark x={mid} y={BOTTOM + 68} textAnchor="middle" className="label fill-(--signal)" style={{ fontSize: 10.5 }}>
                {gap.gap > 0 ? "↑ lift" : "↓ drop"}
              </text>
            )}
            {i === peak && !gap && (
              <text data-mark x={mid} y={BOTTOM + 68} textAnchor="middle" className="label fill-(--model)" style={{ fontSize: 10.5 }}>
                stress
              </text>
            )}
          </g>
        );
      })}

      {modelPath && <path data-line="model" d={modelPath} fill="none" stroke="var(--model)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />}
      {myPath && <path data-line="mine" d={myPath} fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" />}
    </svg>
  );
}
