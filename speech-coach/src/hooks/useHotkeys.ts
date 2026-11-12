"use client";

import { useEffect, useRef } from "react";

export type Hotkeys = Record<string, (() => void) | undefined>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Single-key shortcuts for the core loop. Keys are matched case-insensitively
 * ("space", "enter", "escape", "arrowleft" and letters). Ignored while typing
 * in a field or holding a modifier.
 */
export function useHotkeys(keys: Hotkeys, enabled = true): void {
  const ref = useRef(keys);
  useEffect(() => {
    ref.current = keys;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const name = event.key === " " ? "space" : event.key.toLowerCase();
      const handler = ref.current[name];
      if (!handler) return;
      // Space and Enter on a focused button already click it. Let the shortcut win instead of doing both.
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
