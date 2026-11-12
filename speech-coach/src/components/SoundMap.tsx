"use client";

import gsap from "gsap";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import type { SoundEntry } from "@/hooks/useAtlas";
import { MASTERY_NAMES, MASTERY_RULES, type MasteryLevel } from "@/lib/learning/mastery";
import { canonical, CONSONANTS, MANNERS, PLACES, unplaced, VOWELS } from "@/lib/learning/map";
import { Label, MasteryGlyph } from "./ds/ui";

/**
 * Signature moment three. Every English sound I have practised is a point on
 * one chart, placed where it is made in the mouth. Mastery is elevation: each
 * stage adds a contour ring, so a sound I own stands up like a peak.
 * Each point links to its drill.
 */

const RINGS = [13, 18.5, 24, 29.5];

function merge(sounds: ReadonlyMap<string, SoundEntry>): Map<string, SoundEntry> {
  // Azure may report one sound under two symbols. Keep the entry with more evidence.
  const out = new Map<string, SoundEntry>();
  for (const entry of sounds.values()) {
    const key = canonical(entry.phoneme);
    const existing = out.get(key);
    if (!existing || entry.occurrences > existing.occurrences) out.set(key, entry);
  }
  return out;
}

function Point({ x, y, phoneme, entry }: { x: number; y: number; phoneme: string; entry: SoundEntry | undefined }) {
  const level: MasteryLevel = entry?.level ?? 0;
  const due = entry?.review?.due ?? false;
  const label = entry
    ? `${phoneme}: ${MASTERY_NAMES[level]}, stage ${level} of 4, latest score ${Math.round(entry.latest)}${due ? ", due for review" : ""}`
    : `${phoneme}: not practised yet`;

  const body = (
    <g data-point transform={`translate(${x} ${y})`} className="group">
      <circle r="36" fill="transparent" />
      {entry ? (
        RINGS.slice(0, level).map((r, i) => (
          <circle key={r} data-ring r={r} fill="none" stroke="currentColor" strokeWidth={i === level - 1 ? 1.6 : 1} pathLength={1} strokeDasharray="1" />
        ))
      ) : (
        <circle r="13" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 3.5" opacity="0.35" />
      )}
      {entry && level === 0 && <circle r="13" fill="none" stroke="currentColor" strokeWidth="0.8" />}
      <text
        data-glyph
        textAnchor="middle"
        dominantBaseline="central"
        y="-1"
        className={`ipa ${entry ? "fill-current" : "fill-(--fg-3)"}`}
        style={{ fontSize: phoneme.length > 1 ? 15 : 20, fontWeight: due ? 700 : 400 }}
        opacity={entry ? 1 : 0.55}
      >
        {phoneme}
      </text>
      {due && <circle data-due cx={RINGS[Math.max(0, level - 1)]! * 0.74 + 3} cy={-RINGS[Math.max(0, level - 1)]! * 0.74 - 3} r="4.5" fill="var(--signal)" stroke="var(--bg)" strokeWidth="1.5" />}
      <title>{label}</title>
    </g>
  );

  if (!entry) return <g aria-label={label}>{body}</g>;
  return (
    <Link
      href={`/sound?p=${encodeURIComponent(entry.phoneme)}`}
      aria-label={label}
      className={`outline-none transition-colors duration-200 hover:text-model [&:focus-visible_circle:first-of-type]:stroke-(--focus) [&:focus-visible_circle:first-of-type]:[stroke-width:2] ${due ? "text-signal" : "text-fg"}`}
    >
      {body}
    </Link>
  );
}

export function SoundMap({ sounds }: { sounds: ReadonlyMap<string, SoundEntry> }) {
  const root = useRef<HTMLDivElement>(null);
  const merged = useMemo(() => merge(sounds), [sounds]);
  const others = useMemo(() => unplaced(merged.keys()), [merged]);
  const practised = merged.size;
  const counts = [1, 2, 3, 4].map((level) => [...merged.values()].filter((s) => s.level === level).length);

  // Entrance: the terrain is surveyed. Rings draw outward, lowest ground first.
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      const rings = gsap.utils.toArray<SVGCircleElement>("[data-ring]");
      gsap.set(rings, { strokeDashoffset: 1 });
      gsap.set("[data-glyph]", { opacity: 0 });
      gsap.set("[data-due]", { scale: 0, transformOrigin: "center" });
      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.to("[data-glyph]", { opacity: (_i, node: Element) => Number(node.getAttribute("opacity") ?? 1), duration: 0.5, stagger: { amount: 0.6, from: "random" } }, 0.1);
      tl.to(rings, { strokeDashoffset: 0, duration: 0.9, stagger: { amount: 1.1 } }, 0.35);
      tl.to("[data-due]", { scale: 1, duration: 0.4, stagger: 0.05, ease: "back.out(2)" }, ">-0.2");
    }, el);
    return () => ctx.revert();
  }, [merged]);

  // Consonant plate geometry.
  const cw = 132;
  const rh = 96;
  const left = 104;
  const top = 44;
  const cWidth = left + PLACES.length * cw + 4;
  const cHeight = top + MANNERS.length * rh + 6;
  // Vowel plate: the classic trapezoid, front of the mouth on the left.
  const vW = 640;
  const vH = 470;
  const vx = (x: number, y: number) => 86 + (vW - 172) * (x * (1 - y * 0.34) + y * 0.34);
  const vy = (y: number) => 70 + (vH - 132) * y;

  return (
    <div ref={root}>
      <figure>
        <figcaption className="mb-3 flex items-baseline justify-between gap-4">
          <Label as="span">Plate I · Consonants, by where and how they are made</Label>
          <Label as="span" className="lg:hidden">
            scroll →
          </Label>
        </figcaption>
        <div className="overflow-x-auto" data-lenis-prevent>
          <svg viewBox={`0 0 ${cWidth} ${cHeight}`} className="w-full min-w-[820px]" role="group" aria-label="Consonants">
            {PLACES.map((place, i) => (
              <g key={place}>
                <line x1={left + i * cw} x2={left + i * cw} y1={top - 8} y2={cHeight - 6} stroke="var(--rule)" strokeWidth="1" />
                <text x={left + i * cw + cw / 2} y="20" textAnchor="middle" className="label fill-(--fg-3)" style={{ fontSize: 10 }}>
                  {place}
                </text>
              </g>
            ))}
            <line x1={left + PLACES.length * cw} x2={left + PLACES.length * cw} y1={top - 8} y2={cHeight - 6} stroke="var(--rule)" strokeWidth="1" />
            {MANNERS.map((manner, j) => (
              <g key={manner}>
                <line x1="0" x2={cWidth} y1={top + j * rh} y2={top + j * rh} stroke="var(--rule)" strokeWidth="1" />
                <text x="0" y={top + j * rh + rh / 2 + 3} className="label fill-(--fg-3)" style={{ fontSize: 10 }}>
                  {manner}
                </text>
              </g>
            ))}
            <line x1="0" x2={cWidth} y1={top + MANNERS.length * rh} y2={top + MANNERS.length * rh} stroke="var(--rule)" strokeWidth="1" />
            {CONSONANTS.map((c) => (
              // Voiceless and voiced share a cell: voiceless on the left, voiced on the right.
              <Point key={c.phoneme} phoneme={c.phoneme} entry={merged.get(c.phoneme)} x={left + c.place * cw + cw / 2 + c.side * 32} y={top + c.manner * rh + rh / 2} />
            ))}
          </svg>
        </div>
      </figure>

      <div className="mt-10 grid gap-x-12 gap-y-10 border-t border-rule pt-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <figure className="min-w-0">
          <figcaption className="mb-3">
            <Label as="span">Plate II · Vowels, by tongue position</Label>
          </figcaption>
          <svg viewBox={`0 0 ${vW} ${vH}`} className="w-full" role="group" aria-label="Vowels">
            <polygon points={`${vx(0, 0) - 40},${vy(0) - 40} ${vx(1, 0) + 40},${vy(0) - 40} ${vx(1, 1) + 40},${vy(1) + 40} ${vx(0, 1) - 40},${vy(1) + 40}`} fill="none" stroke="var(--rule)" strokeWidth="1" />
            {[0.33, 0.66].map((t) => (
              <line key={t} x1={vx(0, t) - 40} x2={vx(1, t) + 40} y1={vy(t)} y2={vy(t)} stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 5" />
            ))}
            <line x1={vx(0.5, 0)} x2={vx(0.5, 1)} y1={vy(0) - 40} y2={vy(1) + 40} stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 5" />
            <text x={vx(0, 0) - 40} y="16" className="label fill-(--fg-3)" style={{ fontSize: 10 }}>Front of the mouth</text>
            <text x={vx(1, 0) + 40} y="16" textAnchor="end" className="label fill-(--fg-3)" style={{ fontSize: 10 }}>Back</text>
            <text x="0" y={vy(0) + 3} className="label fill-(--fg-3)" style={{ fontSize: 10 }}>High</text>
            <text x="0" y={vy(1) + 3} className="label fill-(--fg-3)" style={{ fontSize: 10 }}>Low</text>
            {VOWELS.map((v) => (
              <Point key={v.phoneme} phoneme={v.phoneme} entry={merged.get(v.phoneme)} x={vx(v.x, v.y)} y={vy(v.y)} />
            ))}
          </svg>
        </figure>

        <div>
          <Label>How to read it</Label>
          <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-2">
            Mastery is drawn as elevation. Each stage a sound earns adds a contour ring, so the sounds you own stand up like peaks and the ones still forming stay low. {practised} of {CONSONANTS.length + VOWELS.length} sounds are mapped.
          </p>
          <ul className="mt-6 divide-y divide-rule border-y border-rule">
            {([1, 2, 3, 4] as const).map((level, i) => (
              <li key={level} className="flex items-center gap-4 py-3">
                <MasteryGlyph level={level} size={30} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{MASTERY_NAMES[level]}</p>
                  <p className="text-xs leading-snug text-fg-3">{MASTERY_RULES[level]}</p>
                </div>
                <span className="font-mono text-sm tabular-nums text-fg-2">{counts[i]}</span>
              </li>
            ))}
            <li className="flex items-center gap-4 py-3 text-signal">
              <MasteryGlyph level={1} size={30} due />
              <div className="flex-1">
                <p className="text-sm font-medium">Due for review</p>
                <p className="text-xs leading-snug text-fg-3">Drawn in red with a dot. Select any sound to drill it.</p>
              </div>
              <span className="font-mono text-sm tabular-nums">{[...merged.values()].filter((s) => s.review?.due).length}</span>
            </li>
          </ul>
        </div>
      </div>

      {others.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-rule pt-5">
          <Label as="span">Also heard</Label>
          {others.map((p) => {
            const entry = merged.get(p);
            return entry ? (
              <Link key={p} href={`/sound?p=${encodeURIComponent(entry.phoneme)}`} className="press inline-flex items-center gap-2 hover:text-signal">
                <MasteryGlyph level={entry.level} size={20} due={entry.review?.due} />
                <span className="ipa text-xl">{p}</span>
              </Link>
            ) : null;
          })}
        </div>
      )}

    </div>
  );
}
