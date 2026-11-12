"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { buildAssessmentResult, buildTranscriptResult } from "@/lib/azure/normalize";
import { advanceCursor } from "@/lib/diff";
import { actions, newId, useStore } from "@/lib/store";
import { normalizeWords, tokenizeScript } from "@/lib/text";
import type { Script } from "@/lib/types";
import { useConfig } from "./ConfigContext";
import { formatClock, Label, LinkButton, Loading, Note, StateBlock } from "./ds/ui";
import { ErrorState } from "./errorStates";
import { RecordControl, RecordingStatus } from "./RecordControl";
import { Teleprompter } from "./Teleprompter";
import { VoiceField } from "./voice/VoiceField";

function PracticeStage({ script, guided }: { script: Script; guided: boolean }) {
  const router = useRouter();
  const { azure } = useConfig();
  const tokens = useMemo(() => tokenizeScript(script.text), [script.text]);
  const refWords = useMemo(() => tokens.map((t) => t.norm), [tokens]);
  const [cursor, setCursor] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [partialId, setPartialId] = useState<string | null>(null);
  const committed = useRef(0);

  const onFinished = useCallback(
    ({ outcome, error }: TakeFinished) => {
      if (!outcome) return;
      const meta = { id: newId("take"), createdAt: new Date().toISOString(), scriptId: script.id, scriptTitle: script.title, referenceText: script.text };
      const result = azure ? buildAssessmentResult(outcome.segments, meta) : buildTranscriptResult(outcome.transcript, outcome.durationMs, meta);
      actions.saveResult(result, outcome.audio);
      if (error) {
        // The take died part-way. Keep what was captured, and say so instead of moving on silently.
        setPartialId(result.id);
        return;
      }
      router.push(`/results?session=${encodeURIComponent(result.id)}${guided ? "&guided=1" : ""}`);
    },
    [azure, guided, router, script.id, script.text, script.title],
  );

  const recorder = useTakeRecorder(azure, onFinished);
  const { phase, startedAtRef } = recorder;
  const recording = phase === "recording";

  const start = useCallback(() => {
    setCursor(0);
    setElapsedMs(0);
    setPartialId(null);
    committed.current = 0;
    void recorder.start(script.text, {
      onPartial: (text) => setCursor(advanceCursor(refWords, committed.current, normalizeWords(text))),
      onFinal: (text) => {
        committed.current = advanceCursor(refWords, committed.current, normalizeWords(text));
        setCursor(committed.current);
      },
    });
  }, [recorder, refWords, script.text]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 250);
    return () => clearInterval(timer);
  }, [recording, startedAtRef]);

  useHotkeys({ space: recording ? recorder.stop : phase === "idle" ? start : undefined });

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Link href={guided ? "/session" : "/scripts"} className="label text-fg-3 hover:text-fg">
          ← {guided ? "Session" : "Scripts"}
        </Link>
        <Label as="span">{script.title}</Label>
        <Label as="span" className="ml-auto">
          {tokens.length} words · about {formatClock((tokens.length / 140) * 60_000)}
        </Label>
      </div>

      {recorder.error && (
        <div className="mb-8">
          <ErrorState
            error={recorder.error}
            compact
            action={
              partialId ? (
                <LinkButton href={`/results?session=${encodeURIComponent(partialId)}`} variant="quiet">
                  See what was captured before it stopped
                </LinkButton>
              ) : undefined
            }
          />
        </div>
      )}

      <div className="flex-1">
        <Teleprompter tokens={tokens} cursor={cursor} active={recording || phase === "processing"} />
      </div>

      <div className="relative mt-10 border-t border-rule">
        {/* The voice field sits under the script, never behind it. */}
        <VoiceField stream={recorder.stream} active={recording} className="h-36 sm:h-44" />
        <div className="absolute inset-0 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-1">
          <RecordControl phase={phase} onStart={start} onStop={recorder.stop} />
          <RecordingStatus phase={phase} elapsed={formatClock(elapsedMs)} />
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-fg-3">
        {azure
          ? "Read at your normal meeting pace. Your audio is streamed to Azure Speech for scoring. The replay copy stays in this tab."
          : "Transcript-only mode: no Azure key, so this take gets a word-by-word comparison and no sound scores. Your browser's speech recognition may send audio to its vendor."}
      </p>
    </div>
  );
}

export function Practice() {
  const params = useSearchParams();
  const id = params.get("script");
  const guided = params.get("guided") === "1";
  const { hydrated, scripts } = useStore();
  const script = scripts.find((s) => s.id === id);

  if (!hydrated) return <Loading label="Loading script" />;
  if (!script) {
    return (
      <StateBlock kind="empty" title="That script is gone." action={<LinkButton href="/scripts" variant="solid">Back to scripts</LinkButton>}>
        It may have been deleted. Pick another one to practise.
      </StateBlock>
    );
  }
  return (
    <>
      <PracticeStage key={script.id} script={script} guided={guided} />
      <noscript>
        <Note>This app needs JavaScript to record.</Note>
      </noscript>
    </>
  );
}
