"use client";

import { useAtlas } from "@/hooks/useAtlas";
import { modes, useModes } from "@/lib/modes/store";
import { addWords, cleanEntry, isSaved } from "@/lib/modes/words";
import { newId } from "@/lib/store";
import { useConfig } from "../ConfigContext";

/** Save any word from any screen into My words, where it joins the review queue. */
export function SaveWord({ word, className = "" }: { word: string; className?: string }) {
  const { words } = useModes();
  const { azure } = useConfig();
  const atlas = useAtlas();
  const entry = cleanEntry(word);
  if (!entry) return null;
  const saved = isSaved(words, entry);
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        if (saved) {
          const existing = words.find((w) => w.word === entry);
          if (existing) modes.removeWord(existing.id);
        } else {
          modes.setWords(addWords(words, [entry], "saved", atlas.demoMode ? "demo" : azure ? "azure" : "transcript", new Date(), () => newId("word")).words);
        }
      }}
      className={`label press border px-2.5 py-1.5 ${saved ? "border-fg bg-fg !text-bg" : "border-rule-strong text-fg-2 hover:border-fg hover:!text-fg"} ${className}`}
    >
      {saved ? "✓ In my words" : "+ My words"}
    </button>
  );
}
