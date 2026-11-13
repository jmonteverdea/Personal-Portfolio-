import type { LipPose, MouthShape, TonguePose } from "@/lib/modes/soundLibrary";

/**
 * A schematic side view of the mouth, lips on the left. It shows the idea of
 * a position: where the tongue goes, what the lips do, where the air leaves.
 * It is not anatomy and is labelled as a schematic wherever it is drawn.
 */

type Pt = readonly [number, number];
const TONGUE: Record<TonguePose, { tip: Pt; hump: Pt }> = {
  rest: { tip: [70, 96], hump: [122, 88] },
  teeth: { tip: [53, 84], hump: [116, 84] },
  ridge: { tip: [70, 66], hump: [122, 84] },
  "ridge-near": { tip: [70, 72], hump: [122, 82] },
  post: { tip: [80, 62], hump: [116, 70] },
  palate: { tip: [68, 94], hump: [104, 56] },
  velum: { tip: [70, 98], hump: [150, 58] },
  curl: { tip: [96, 62], hump: [138, 80] },
  "high-front": { tip: [68, 92], hump: [102, 58] },
  "mid-front": { tip: [68, 95], hump: [106, 70] },
  "low-front": { tip: [68, 100], hump: [112, 90] },
  mid: { tip: [70, 96], hump: [124, 76] },
  "high-back": { tip: [72, 98], hump: [148, 62] },
  "mid-back": { tip: [72, 100], hump: [146, 76] },
  "low-back": { tip: [72, 102], hump: [144, 92] },
};

function jawDrop(shape: { tongue: TonguePose; lips: LipPose }): number {
  if (shape.lips === "closed" || shape.lips === "teeth-lip") return 0;
  if (shape.lips === "open" || shape.tongue.startsWith("low")) return 16;
  if (shape.tongue.startsWith("mid")) return 9;
  return 4;
}

function tonguePath(pose: TonguePose, drop: number): string {
  const { tip, hump } = TONGUE[pose];
  // Vowel positions ride on the jaw. Consonant contacts stay where the roof of the mouth is.
  const rides = pose.startsWith("low") || pose.startsWith("mid") || pose === "rest";
  const d = rides ? drop : drop * 0.35;
  const [tx, ty] = [tip[0], tip[1] + d];
  const [hx, hy] = [hump[0], hump[1] + d];
  const floor = 150 + drop;
  return `M188 ${floor} C188 ${hy + 16} ${hx + 26} ${hy} ${hx} ${hy} C${hx - 22} ${hy} ${tx + 22} ${ty - 3} ${tx} ${ty} C${tx - 5} ${ty + 4} ${tx + 2} ${ty + 12} ${tx + 12} ${ty + 16} L${tx + 16} ${floor} Z`;
}

export function MouthDiagram({ shape, className = "" }: { shape: MouthShape; className?: string }) {
  const drop = jawDrop(shape);
  const round = shape.lips === "round" || shape.lips === "round-tight";
  const push = round ? -7 : 0;
  const lowerLipY = shape.lips === "closed" ? 80 : shape.lips === "teeth-lip" ? 84 : shape.lips === "round-tight" ? 86 : 92 + drop;
  const lowerLipX = shape.lips === "teeth-lip" ? 56 : 44 + push;
  const airY = shape.lips === "closed" ? 0 : (78 + lowerLipY) / 2;
  const parts = [
    `tongue ${shape.tongue.replace("-", " ")}`,
    `lips ${shape.lips.replace("-", " ")}`,
    shape.voiced ? "voice on" : "voice off",
    shape.air === "nose" ? "air through the nose" : shape.air === "stop" ? "air stopped, then released" : "air through the mouth",
  ];

  return (
    <svg viewBox="0 0 240 190" className={className} role="img" aria-label={`Schematic mouth position: ${parts.join(", ")}`}>
      {/* roof of the mouth: upper lip, teeth, ridge, palate, soft palate */}
      <path d={`M${22 + push} 58 Q${40 + push} 52 ${46 + push} 66 Q${48 + push} 74 ${42 + push} 77`} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M57 64 L60 82 L64 66" fill="var(--surface)" stroke="var(--fg)" strokeWidth="1.25" strokeLinejoin="round" />
      <path d={`M46 62 Q60 54 72 58 Q104 28 150 46 Q170 54 ${shape.air === "nose" ? "170 78" : "182 60"}`} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M196 34 L196 172" fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" />
      {/* nasal passage, drawn only as a route for the air */}
      <path d="M30 40 Q110 8 190 40" fill="none" stroke="var(--rule-strong)" strokeWidth="1" strokeDasharray="2 5" />

      {/* tongue: the end position of a diphthong sits behind as a dashed outline */}
      {shape.to && <path d={tonguePath(shape.to.tongue, jawDrop(shape.to))} fill="none" stroke="var(--model)" strokeWidth="1.25" strokeDasharray="3 4" />}
      <path d={tonguePath(shape.tongue, drop)} fill="color-mix(in oklab, var(--signal) 16%, transparent)" stroke="var(--signal)" strokeWidth="1.6" strokeLinejoin="round" />

      {/* lower teeth, lip and jaw move together */}
      {shape.lips !== "teeth-lip" && <path d={`M58 ${100 + drop} L60 ${86 + drop} L63 ${100 + drop}`} fill="var(--surface)" stroke="var(--fg)" strokeWidth="1.25" strokeLinejoin="round" />}
      <path d={`M${lowerLipX - 22} ${lowerLipY + 20} Q${lowerLipX - 6} ${lowerLipY + 20} ${lowerLipX} ${lowerLipY + 6} Q${lowerLipX + 2} ${lowerLipY - 2} ${lowerLipX - 3} ${lowerLipY - 3}`} fill="none" stroke="var(--fg)" strokeWidth="1.5" strokeLinecap="round" />
      <path d={`M${lowerLipX - 22} ${lowerLipY + 20} Q60 ${166 + drop} 150 ${170 + drop}`} fill="none" stroke="var(--rule-strong)" strokeWidth="1" />

      {/* air */}
      {shape.air === "nose" ? (
        <path d="M176 34 Q110 8 40 36 M40 36 l9 -1 M40 36 l5 -8" fill="none" stroke="var(--model)" strokeWidth="1.5" strokeLinecap="round" />
      ) : shape.lips === "closed" ? (
        <path d="M36 70 L36 88 M30 79 L18 79" fill="none" stroke="var(--model)" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d={`M52 ${airY} L${14 + push} ${airY} M${14 + push} ${airY} l8 -5 M${14 + push} ${airY} l8 5`} fill="none" stroke="var(--model)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={shape.air === "stop" ? "3 4" : undefined} />
      )}

      {/* voice: a wave at the throat when the vocal folds vibrate, an empty ring when they do not */}
      {shape.voiced ? (
        <path d="M204 150 q4 -8 8 0 t8 0 t8 0" fill="none" stroke="var(--signal)" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <circle cx="216" cy="150" r="6" fill="none" stroke="var(--fg-3)" strokeWidth="1.25" />
      )}
      <text x="216" y="172" textAnchor="middle" className="label fill-(--fg-3)" style={{ fontSize: 7.5 }}>
        {shape.voiced ? "voice on" : "voice off"}
      </text>
    </svg>
  );
}
