"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { DEMO_FREE_TALK, demoTurn } from "@/lib/fixtures/demo-modes";
import { modes } from "@/lib/modes/store";
import { FREE_PROMPTS, turnFromOutcome } from "@/lib/modes/talk";
import type { TalkTurn } from "@/lib/modes/types";
import { newId } from "@/lib/store";
import { useConfig } from "../ConfigContext";
import { Button, formatClock, Label, LinkButton, Loading, StateBlock } from "../ds/ui";
import { ErrorState } from "../errorStates";
import { RecordControl } from "../RecordControl";
import { VoiceField } from "../voice/VoiceField";

const MIN_MS = 60_000;
const MAX_MS = 120_000;

/** Free talk: one prompt, one to two minutes, then the delivery report. */
export function FreeTalk() {
  const router = useRouter();
  const { azure } = useConfig();
  const atlas = useAtlas();
  const promptId = useSearchParams().get("p");
  const prompt = FREE_PROMPTS.find((p) => p.id === promptId) ?? null;
  const [elapsed, setElapsed] = useState(0);

  const save = useCallback(
    (turn: TalkTurn) => {
      if (!prompt) return;
      const id = newId("talk");
      modes.addTalk({ id, date: new Date().toISOString(), kind: "free", scenarioId: prompt.id, title: prompt.title, turns: [turn], source: atlas.demoMode ? "demo" : azure ? "azure" : "transcript", rewording: null });
      router.push(`/talk/report?id=${encodeURIComponent(id)}`);
    },
    [atlas.demoMode, azure, prompt, router],
  );
  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (outcome) save(turnFromOutcome(outcome));
    },
    [save],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const { phase, startedAtRef, stop } = recorder;
  const recording = phase === "recording";

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const ms = performance.now() - startedAtRef.current;
      setElapsed(ms);
      // Two minutes is the ceiling: a longer answer is the thing this mode is training out.
      if (ms >= MAX_MS) stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording, startedAtRef, stop]);

  const start = useCallback(() => {
    setElapsed(0);
    void recorder.start("");
  }, [recorder]);
  const simulate = useCallback(() => save(demoTurn(DEMO_FREE_TALK)), [save]);

  useHotkeys({
    space: atlas.demoMode ? undefined : recording ? stop : phase === "idle" ? start : undefined,
    enter: atlas.demoMode ? simulate : undefined,
  });

  if (!atlas.hydrated) return <Loading label="One moment" />;
  if (!prompt) {
    return (
      <StateBlock kind="empty" title="No prompt chosen." action={<LinkButton href="/speak" variant="solid">Pick a prompt</LinkButton>}>
        Choose a free-talk prompt from the Speak page.
      </StateBlock>
    );
  }

  const inWindow = elapsed >= MIN_MS;
  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link href="/speak" className="label text-fg-3 hover:text-fg">
          ← Speak
        </Link>
        <Label as="span">Free talk · {prompt.title}</Label>
      </div>

      {recorder.error && (
        <div className="mb-8">
          <ErrorState error={recorder.error} compact />
        </div>
      )}

      <div className="flex-1">
        <p className="prompter max-w-[24ch] text-balance">{prompt.prompt}</p>
        <p className="mt-8 max-w-xl text-base leading-relaxed text-fg-2">Speak for one to two minutes, in your own words. There is no script and nothing to read. The recording stops by itself at two minutes.</p>
      </div>

      <div className="mt-8" aria-hidden={!recording}>
        <div className="relative h-1 bg-rule">
          <div className={`h-full ${inWindow ? "bg-good" : "bg-fg"}`} style={{ width: `${Math.min(100, (elapsed / MAX_MS) * 100)}%` }} />
          <span className="absolute -top-1.5 h-4 w-px bg-fg-3" style={{ left: "50%" }} />
        </div>
        <div className="mt-2 flex justify-between">
          <span className="font-mono text-lg tabular-nums">{formatClock(elapsed)}</span>
          <span className="label absolute left-1/2 hidden -translate-x-1/2 text-fg-3 sm:block">1:00 · long enough</span>
          <span className="label text-fg-3">2:00 · stop</span>
        </div>
      </div>

      <div className="relative mt-6 border-t border-rule">
        <VoiceField stream={recorder.stream} active={recording} className="h-32" />
        <div className="absolute inset-0 flex flex-wrap items-center gap-4 px-1">
          {atlas.demoMode ? (
            <Button variant="solid" size="lg" onClick={simulate} hotkey="enter">
              Simulate my talk
            </Button>
          ) : (
            <RecordControl phase={phase} onStart={start} onStop={stop} idleLabel="Start talking" />
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-fg-3">
        {atlas.demoMode ? "Demo: no microphone is used. A sample talk stands in for yours." : azure ? "Your audio is streamed to Azure Speech." : "Transcript-only: your words are captured, sounds are not scored, and pauses cannot be timed."}
      </p>
    </div>
  );
}
