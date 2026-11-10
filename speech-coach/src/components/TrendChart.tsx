import type { SessionRecord, Scores } from "@/lib/types";

export type Metric = keyof Scores;

export const METRICS: { key: Metric; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "accuracy", label: "Accuracy" },
  { key: "fluency", label: "Fluency" },
  { key: "completeness", label: "Completeness" },
  { key: "prosody", label: "Prosody" },
];

const W = 720;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 30, left: 36 };

/** Score over time for one metric. Plain SVG, no chart library. */
export function TrendChart({ sessions, metric }: { sessions: SessionRecord[]; metric: Metric }) {
  const points = sessions.flatMap((s) => {
    const value = s.scores?.[metric];
    return typeof value === "number" ? [{ id: s.id, date: s.date, title: s.scriptTitle, value }] : [];
  });
  const label = METRICS.find((m) => m.key === metric)?.label ?? metric;

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No {label.toLowerCase()} scores yet. Scored takes need Azure Speech.</p>;
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - v / 100) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label} score across ${points.length} sessions, from ${Math.round(first?.value ?? 0)} to ${Math.round(last?.value ?? 0)}`}>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-stone-200" strokeWidth="1" strokeDasharray={tick === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-stone-500 text-[11px]">{tick}</text>
          </g>
        ))}
        {points.length > 1 && <path d={path} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.value)} r="4.5" className="fill-white stroke-accent" strokeWidth="2.5">
              <title>{`${day(p.date)}: ${Math.round(p.value)} (${p.title})`}</title>
            </circle>
            {(points.length <= 8 || i === points.length - 1) && (
              <text x={x(i)} y={y(p.value) - 10} textAnchor="middle" className="fill-stone-700 text-[11px] font-medium">{Math.round(p.value)}</text>
            )}
          </g>
        ))}
        {first && <text x={x(0)} y={H - 8} textAnchor={points.length === 1 ? "middle" : "start"} className="fill-stone-500 text-[11px]">{day(first.date)}</text>}
        {last && points.length > 1 && <text x={x(points.length - 1)} y={H - 8} textAnchor="end" className="fill-stone-500 text-[11px]">{day(last.date)}</text>}
      </svg>
      <figcaption className="sr-only">
        {points.map((p) => `${day(p.date)}: ${Math.round(p.value)}`).join(", ")}
      </figcaption>
    </figure>
  );
}
