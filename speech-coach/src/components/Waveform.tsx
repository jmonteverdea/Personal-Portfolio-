"use client";

import { useEffect, useRef } from "react";

/** Live waveform from the microphone stream. Draws a flat line when idle. */
export function Waveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const drawLine = (points: Uint8Array | null) => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = points ? "#0f6b5c" : "#c9cfca";
      ctx.beginPath();
      if (!points) {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      } else {
        const step = width / (points.length - 1);
        for (let i = 0; i < points.length; i++) {
          const y = ((points[i] ?? 128) / 255) * height;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * step, y);
        }
      }
      ctx.stroke();
    };

    if (!stream) {
      drawLine(null);
      return () => window.removeEventListener("resize", resize);
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      drawLine(data);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      source.disconnect();
      void audioContext.close();
    };
  }, [stream]);

  return <canvas ref={canvasRef} className="h-16 w-full" role="img" aria-label={stream ? "Live microphone waveform" : "Microphone idle"} />;
}
