"use client";

import { useEffect, useRef } from "react";
import type { ScriptToken } from "@/lib/text";

/**
 * The typographic hero. Large display type, readable from a metre away.
 * `cursor` is the next word to say: what is said dims, the current word is
 * marked with a rule under it, never with motion that competes with reading.
 */
export function Teleprompter({ tokens, cursor, active }: { tokens: ScriptToken[]; cursor: number; active: boolean }) {
  const currentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [cursor, active]);

  return (
    <div data-lenis-prevent className="prompter max-h-[52vh] overflow-y-auto pb-[1.2em] pr-2 [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,black_calc(100%-2.2em),transparent)]" aria-label="Script">
      <p className="max-w-[26ch] text-balance sm:max-w-[30ch] lg:max-w-[34ch]">
        {tokens.map((token, i) => {
          const isCurrent = active && i === cursor;
          const done = active && i < cursor;
          return (
            <span key={i}>
              <span
                ref={isCurrent ? currentRef : undefined}
                data-current={isCurrent || undefined}
                className={`transition-colors duration-200 ${
                  isCurrent ? "text-fg underline decoration-signal decoration-[0.09em] underline-offset-[0.22em]" : done ? "text-fg-3/55" : "text-fg"
                }`}
              >
                {token.display}
              </span>{" "}
            </span>
          );
        })}
      </p>
    </div>
  );
}
