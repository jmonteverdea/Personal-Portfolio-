"use client";

import { useEffect, useRef } from "react";
import type { ScriptToken } from "@/lib/text";

/**
 * Large-type script view. `cursor` is the index of the next word to say:
 * everything before it is dimmed, the word at it is highlighted and kept in view.
 */
export function Teleprompter({ tokens, cursor, active }: { tokens: ScriptToken[]; cursor: number; active: boolean }) {
  const currentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [cursor, active]);

  return (
    <div
      className="max-h-[46vh] overflow-y-auto rounded-2xl border border-line bg-white px-6 py-8 sm:px-10"
      aria-label="Script"
    >
      <p className="text-2xl leading-[1.7] sm:text-3xl sm:leading-[1.7]">
        {tokens.map((token, i) => {
          const isCurrent = active && i === cursor;
          const done = active && i < cursor;
          const startsSentence = i > 0 && tokens[i - 1]?.sentenceIndex !== token.sentenceIndex;
          return (
            <span key={i}>
              {startsSentence && <span className="inline-block w-2" aria-hidden />}
              <span
                ref={isCurrent ? currentRef : undefined}
                className={`rounded-md px-1 py-0.5 transition-colors ${
                  isCurrent ? "bg-accent text-white" : done ? "text-stone-400" : "text-ink"
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
