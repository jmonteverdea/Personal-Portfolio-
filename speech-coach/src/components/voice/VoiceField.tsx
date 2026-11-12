"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { drawContours } from "./contour2d";
import { createLevelMeter, SILENT, type LevelMeter } from "./levels";

/**
 * The live voice field. Three renderers, one visual language:
 *   webgl   the contour shader (OGL, loaded on demand)
 *   canvas  contour rings in Canvas 2D: weak devices, no WebGL 2, or the shader running slow
 *   still   one drawn frame plus a plain level bar: prefers-reduced-motion
 * It only animates while `active`. Before and after a take it holds a still frame.
 */

type Mode = "webgl" | "canvas" | "still";

const COLORS = { bg: "#111215", line: "#f2ede2", hot: "#ff6a47" };
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** Frame time over which the shader is considered too slow for this machine. */
const SLOW_FRAME_MS = 24;
const SAMPLE_FRAMES = 70;

function pickMode(reduce: boolean): Mode {
  if (reduce) return "still";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2;
  if (weak) return "canvas";
  try {
    const probe = document.createElement("canvas").getContext("webgl2");
    if (!probe) return "canvas";
    probe.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return "canvas";
  }
  // Lets the fallback be checked on a machine that has WebGL: add ?voice=canvas to the URL.
  if (new URLSearchParams(window.location.search).get("voice") === "canvas") return "canvas";
  return "webgl";
}

export function VoiceField({ stream, active, className = "" }: { stream: MediaStream | null; active: boolean; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  /** Bumped when the shader proves too slow, to remount the canvas for the 2D renderer. */
  const [generation, setGeneration] = useState(0);
  const forcedCanvas = generation > 0;

  useEffect(() => {
    // Capability is only knowable in the browser, after mount.
    const id = requestAnimationFrame(() => setMode(forcedCanvas && !reduce ? "canvas" : pickMode(reduce)));
    return () => cancelAnimationFrame(id);
  }, [reduce, forcedCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mode) return;
    let disposed = false;
    let frame = 0;
    let meter: LevelMeter | null = null;
    let cleanup = () => {};
    const running = active && stream !== null;
    if (running && stream) {
      try {
        meter = createLevelMeter(stream);
      } catch {
        meter = null;
      }
    }
    const read = () => meter?.read() ?? SILENT;
    // Measure the frame, not the canvas: the WebGL renderer pins the canvas to the size it is given.
    const frame_ = canvas.parentElement ?? canvas;
    const size = () => ({ w: Math.max(1, frame_.clientWidth), h: Math.max(1, frame_.clientHeight) });

    if (mode === "webgl") {
      void import("ogl").then(({ Renderer, Program, Mesh, Triangle }) => {
        if (disposed) return;
        let renderer: InstanceType<typeof Renderer>;
        try {
          renderer = new Renderer({ canvas, dpr: Math.min(window.devicePixelRatio || 1, 1.5), antialias: false, alpha: false, webgl: 2 });
        } catch {
          setGeneration((g) => g + 1);
          return;
        }
        if (!renderer.isWebgl2) {
          setGeneration((g) => g + 1);
          return;
        }
        const gl = renderer.gl;
        void import("./shader").then(({ VERTEX, FRAGMENT }) => {
          if (disposed) return;
          const program = new Program(gl, {
            vertex: VERTEX,
            fragment: FRAGMENT,
            uniforms: {
              uTime: { value: 0 },
              uRes: { value: [1, 1] },
              uLevel: { value: 0 },
              uBands: { value: [0, 0, 0] },
              uBg: { value: rgb(COLORS.bg) },
              uLine: { value: rgb(COLORS.line) },
              uHot: { value: rgb(COLORS.hot) },
            },
          });
          const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
          let scale = 1;
          const resize = () => {
            const { w, h } = size();
            renderer.dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
            renderer.setSize(w, h);
            program.uniforms.uRes!.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
          };
          resize();
          const observer = new ResizeObserver(resize);
          observer.observe(frame_);

          const started = performance.now();
          let last = started;
          let sampled = 0;
          let sampleTotal = 0;
          const draw = (now: number) => {
            const levels = read();
            program.uniforms.uTime!.value = (now - started) / 1000;
            program.uniforms.uLevel!.value = levels.level;
            program.uniforms.uBands!.value = [levels.low, levels.mid, levels.high];
            renderer.render({ scene: mesh });
          };
          const tick = (now: number) => {
            if (disposed) return;
            draw(now);
            // Watch the first second. If this machine cannot hold the frame rate, render smaller, then switch renderer.
            if (sampled < SAMPLE_FRAMES) {
              sampleTotal += now - last;
              sampled += 1;
              if (sampled === SAMPLE_FRAMES && sampleTotal / SAMPLE_FRAMES > SLOW_FRAME_MS) {
                if (scale === 1) {
                  scale = 0.55;
                  sampled = 0;
                  sampleTotal = 0;
                  resize();
                } else {
                  setGeneration((g) => g + 1);
                  return;
                }
              }
            }
            last = now;
            if (!document.hidden) frame = requestAnimationFrame(tick);
          };
          const onVisible = () => {
            if (!document.hidden && running && !disposed) {
              last = performance.now();
              frame = requestAnimationFrame(tick);
            }
          };
          if (running) {
            frame = requestAnimationFrame(tick);
            document.addEventListener("visibilitychange", onVisible);
          } else {
            draw(started);
          }
          // The context is not force-lost here: React may re-run this effect on the same canvas,
          // and a lost context cannot be used again. It is released with the canvas.
          cleanup = () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", onVisible);
          };
        });
      });
    } else {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const paint = (time: number) => {
          const { w, h } = size();
          if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawContours(ctx, w, h, time, mode === "still" ? SILENT : read(), COLORS);
        };
        const observer = new ResizeObserver(() => paint(0));
        observer.observe(frame_);
        paint(0);
        if (running && mode === "canvas") {
          const started = performance.now();
          const tick = (now: number) => {
            if (disposed) return;
            paint((now - started) / 1000);
            if (!document.hidden) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }
        let timer: ReturnType<typeof setInterval> | null = null;
        if (running && mode === "still") {
          // No motion, but I still need to see that the microphone hears me.
          timer = setInterval(() => {
            if (barRef.current) barRef.current.style.width = `${Math.round(read().level * 100)}%`;
          }, 120);
        }
        cleanup = () => {
          observer.disconnect();
          if (timer) clearInterval(timer);
        };
      }
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup();
      meter?.dispose();
    };
  }, [mode, active, stream]);

  return (
    <div className={`relative overflow-hidden ${className}`} data-voice-mode={mode ?? "pending"}>
      <canvas
        key={`${mode === "webgl" ? "gl" : "2d"}-${generation}`}
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={active ? "Live picture of your voice" : "Voice field, idle"}
      />
      {mode === "still" && active && (
        <div className="absolute inset-x-[20%] bottom-3 h-[3px] bg-rule" aria-hidden>
          <div ref={barRef} className="h-full bg-signal" style={{ width: "0%" }} />
        </div>
      )}
    </div>
  );
}
