import type { Levels } from "./levels";

/**
 * The same idea without WebGL: contour rings around a central hill, drawn with
 * Canvas 2D. Used on weak devices, when WebGL 2 is missing, and (drawn once,
 * still) when reduced motion is on.
 */
export function drawContours(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  levels: Levels,
  colors: { bg: string; line: string; hot: string },
): void {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const rings = 9;
  const reach = Math.min(width * 0.46, height * 1.5);
  const points = 72;

  for (let k = rings; k >= 1; k--) {
    const depth = k / rings;
    const swell = 1 + levels.level * (1.15 - depth) * 0.9 + levels.low * 0.18;
    const rx = reach * depth * swell;
    const ry = height * 0.46 * depth * swell;
    const wobble = (0.035 + levels.mid * 0.09) * (1.1 - depth);
    const hot = Math.max(0, Math.min(1, levels.level * 1.8 - depth * 0.9));

    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const n =
        Math.sin(a * 3 + time * 0.5 + k * 1.7) * wobble +
        Math.sin(a * 7 - time * 0.8 + k) * wobble * 0.4 +
        Math.sin(a * 19 + time * 3) * levels.high * 0.02;
      const x = cx + Math.cos(a) * rx * (1 + n);
      const y = cy + Math.sin(a) * ry * (1 + n);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineWidth = k % 4 === 1 ? 1.5 : 1;
    ctx.globalAlpha = (k % 4 === 1 ? 0.42 : 0.2) + hot * 0.5;
    ctx.strokeStyle = hot > 0.08 ? colors.hot : colors.line;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Soft fade at the top and bottom, as in the shader.
  const fade = ctx.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, colors.bg);
  fade.addColorStop(0.3, "rgba(0,0,0,0)");
  fade.addColorStop(0.7, "rgba(0,0,0,0)");
  fade.addColorStop(1, colors.bg);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height);
}
