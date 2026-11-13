"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { converse } from "@/lib/modes/api";
import { tightenByRules } from "@/lib/modes/delivery";
import { modes } from "@/lib/modes/store";
import type { TalkRecord } from "@/lib/modes/types";
import { actions } from "@/lib/store";
import { useConfig } from "../ConfigContext";
import { Button, Label, Plate } from "../ds/ui";

/** One tighter version of my weakest answer, which I can then rehearse as a script. */
export function Rewording({ talk, weakestTurn }: { talk: TalkRecord; weakestTurn: number | null }) {
  const router = useRouter();
  const { anthropic } = useConfig();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const turn = weakestTurn === null ? null : talk.turns[weakestTurn] ?? null;
  if (!turn || weakestTurn === null) return null;
  const question = [...talk.turns.slice(0, weakestTurn)].reverse().find((t) => t.role === "partner")?.text;
  const rewording = talk.rewording;

  const tighten = async () => {
    setBusy(true);
    setNote(null);
    let suggestion: string | null = null;
    let by: "claude" | "rules" = "rules";
    if (anthropic && talk.source !== "demo") {
      try {
        suggestion = (await converse.reword(turn.text, question)).suggestion;
        by = "claude";
      } catch {
        setNote("Claude did not answer, so this was tightened by rule instead.");
      }
    }
    suggestion ??= tightenByRules(turn.text);
    modes.setRewording(talk.id, { original: turn.text, suggestion, by });
    setBusy(false);
  };

  const rehearse = () => {
    if (!rewording) return;
    const script = actions.saveScript({ title: `${talk.title}: tighter answer`, text: rewording.suggestion, tags: talk.kind === "conversation" ? ["meeting"] : [] });
    router.push(`/practice?script=${encodeURIComponent(script.id)}`);
  };

  return (
    <Plate caption="Your weakest answer" aside={rewording ? <Label as="span">{rewording.by === "claude" ? "tightened by Claude" : "tightened by rule · no AI"}</Label> : undefined}>
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <div>
          <Label>As you said it · {turn.text.split(/\s+/).length} words</Label>
          <p className="mt-3 text-lg leading-relaxed text-fg-2">{turn.text}</p>
        </div>
        <div>
          {rewording ? (
            <>
              <Label className="!text-good">Tighter · {rewording.suggestion.split(/\s+/).length} words</Label>
              <p className="display mt-3 text-2xl leading-snug">{rewording.suggestion}</p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Button variant="solid" onClick={rehearse}>
                  Rehearse it as a script
                </Button>
                {rewording.by === "rules" && <span className="max-w-xs text-xs leading-relaxed text-fg-3">Fillers, hedges and repeats removed. A rule cannot restructure a sentence. {anthropic ? "" : "An Anthropic key adds a real rewrite."}</span>}
              </div>
            </>
          ) : (
            <>
              <Label>The same thing, tighter</Label>
              <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-2">
                This answer had the most fillers, hedges and repeats for its length. Get one tighter version of it, then rehearse that version on the teleprompter.
              </p>
              <div className="mt-5">
                <Button variant="solid" onClick={() => void tighten()} busy={busy}>
                  Tighten this answer
                </Button>
              </div>
              <p className="mt-3 text-xs text-fg-3">{anthropic && talk.source !== "demo" ? "This answer is sent to Anthropic." : "Done on this device by rule. Nothing is sent anywhere."}</p>
            </>
          )}
          {note && <p className="mt-3 text-xs text-fg-3">{note}</p>}
        </div>
      </div>
    </Plate>
  );
}
