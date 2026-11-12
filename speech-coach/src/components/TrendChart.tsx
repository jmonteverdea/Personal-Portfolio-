import type { Scores, SessionRecord } from "@/lib/types";
import { formatDay } from "./ds/ui";

export type Metric = keyof Scores;

export const METRICS: { key: Metric; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "accuracy", label: "Accuracy" },
  { key: "fluency", label: "Fluency" },
  { key: "completeness", label: "Completeness" },
  { key: "prosody", label: "Prosody" },
];

const W = 760;
const H = 300;
const PAD = { top: 34, right: 52, bottom: 40, left: 36 };

/** Score over time, drawn to the system: hairlines, an index line at 80, the best take flagged. */
export function TrendChart({ sessions, metric }: { sessions: SessionRecord[]; metric: Metric }) {
  const points = sessions.flatMap((s) => {
    const value = s.scores?.[metric];
    return typeof value === "number" ? [{ id: s.id, date: s.date, title: s.scriptTitle, value }] : [];
  });
  const label = METRICS.find((m) => m.key === metric)?.label ?? metric;
  if (points.length === 0) {
    return <p className="py-14 text-center text-sm text-fg-3">No {label.toLowerCase()} scores yet. Scored takes need Azure Speech.</p>;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const floor = Math.max(0, Math.min(40, Math.floor((Math.min(...points.map((p) => p.value)) - 12) / 10) * 10));
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - floor) / (100 - floor)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const best = points.reduce((b, p, i) => (p.value > points[b]!.value ? i : b), 0);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const ticks = [floor, 60, 80, 100].filter((t, i, all) => t >= floor && all.indexOf(t) === i);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} across ${points.length} takes, from ${Math.round(first.value)} to ${Math.round(last.value)}. Best ${Math.round(points[best]!.value)}.`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke={tick === 80 ? "var(--rule-strong)" : "var(--rule)"} strokeWidth="1" strokeDasharray={tick === 80 ? undefined : "2 6"} />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" className="fill-(--fg-3) font-mono" style={{ fontSize: 13 }}>
              {tick}
            </text>
          </g>
        ))}
        <text x={W - PAD.right + 8} y={y(80) + 4} className="label fill-(--fg-3)" style={{ fontSize: 10.5 }}>
          good
        </text>
        {points.length > 1 && <path d={path} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinejoin="round" />}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <g key={p.id}>
              {i === best && points.length > 1 && (
                <>
                  <line x1={x(i)} x2={x(i)} y1={y(p.value) - 9} y2={y(p.value) - 24} stroke="var(--good)" strokeWidth="1" />
                  <text x={x(i)} y={y(p.value) - 29} textAnchor={i === 0 ? "start" : isLast ? "end" : "middle"} className="label fill-(--good)" style={{ fontSize: 10.5 }}>
                    best
                  </text>
                </>
              )}
              <circle cx={x(i)} cy={y(p.value)} r={isLast ? 6 : 4.5} fill={isLast ? "var(--fg)" : "var(--bg)"} stroke="var(--fg)" strokeWidth="1.5">
                <title>{`${formatDay(p.date)}: ${Math.round(p.value)} (${p.title})`}</title>
              </circle>
              {(points.length <= 10 || isLast || i === best) && (
                <text x={x(i)} y={y(p.value) + 22} textAnchor="middle" className="fill-(--fg-2) font-mono" style={{ fontSize: 13 }}>
                  {Math.round(p.value)}
                </text>
              )}
            </g>
          );
        })}
        <text x={x(0)} y={H - 8} textAnchor={points.length === 1 ? "middle" : "start"} className="label fill-(--fg-3)" style={{ fontSize: 10.5 }}>
          {formatDay(first.date)}
        </text>
        {points.length > 1 && (
          <text x={x(points.length - 1)} y={H - 8} textAnchor="end" className="label fill-(--fg-3)" style={{ fontSize: 10.5 }}>
            {formatDay(last.date)}
          </text>
        )}
      </svg>
      <figcaption className="sr-only">{points.map((p) => `${formatDay(p.date)}: ${Math.round(p.value)}`).join(", ")}</figcaption>
    </figure>
  );
}
