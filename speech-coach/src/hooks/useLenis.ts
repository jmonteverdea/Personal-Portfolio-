"use client";

import { useEffect } from "react";

/**
 * Smooth scroll for the long reading pages only (results, progress).
 * Never on speaking surfaces, and never with reduced motion. Loaded on demand.
 */
export function useLenis(): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Touch devices already scroll well. Smoothing there only adds lag.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let disposed = false;
    let destroy = () => {};
    void import("lenis").then(({ default: Lenis }) => {
      if (disposed) return;
      const lenis = new Lenis({ autoRaf: true, lerp: 0.12 });
      destroy = () => lenis.destroy();
    });
    return () => {
      disposed = true;
      destroy();
    };
  }, []);
}
