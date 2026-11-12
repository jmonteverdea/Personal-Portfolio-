"use client";

import { useCallback, useMemo, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useCompare, type MineClip } from "@/hooks/useCompare";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { buildAssessmentResult, buildTranscriptResult } from "@/lib/azure/normalize";
import { simulateRetryScores } from "@/lib/fixtures/demo-learning";
import { getLearningAudio, learning, useLearning } from "@/lib/learning/store";
import type { RetryRecord } from "@/lib/learning/types";
import { newId } from "@/lib/store";
import type { AssessmentResult, WordResult } from "@/lib/types";
import { useConfig } from "../ConfigContext";
import { band, BAND_TEXT, bare, Button, Delta, Label, wordClass } from "../ds/ui";
import { ErrorState } from "../errorStates";
import { RecordControl } from "../RecordControl";
import { VoiceField } from "../voice/VoiceField";

export interface RetryTarget {
  kind: "word" | "sentence";
  /** Word index in `result.words`, or sentence index. */
  index: number;
}

function mean(values: (number | null)[]): number | null {
  const scored = values.filter((v): v is number => v !== null);
  return scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
}

function statusOf(accuracy: number | null, said: boolean): WordResult["status"] {
  if (!said) return "omission";
  return accuracy !== null && accuracy < 60 ? "mispronounced" : "correct";
}

/**
 * Fix it now. Re-record one word or one sentence right where the feedback is,
 * then see before and after side by side.
 */
export function RetryPanel({ result, target, onClose }: { result: AssessmentResult; target: RetryTarget; onClose: () => void }) {
  const { azure } = useConfig();
  const atlas = useAtlas();
  const { retries } = useLearning();
  const player = useCompare();
  const [heardModel, setHeardModel] = useState(false);

  const beforeWords = useMemo(
    () =>
      target.kind === "word"
        ? result.words.filter((w) => w.index === target.index)
        : result.words.filter((w) => w.sentenceIndex === target.index && w.status !== "insertion"),
    [result.words, target],
  );
  const text = target.kind === "word" ? bare(beforeWords[0]?.text ?? "") : result.sentences[target.index] ?? "";
  const before = mean(beforeWords.map((w) => (w.status === "omission" ? 0 : w.accuracy)));
  const targetIndex = target.kind === "word" ? beforeWords[0]?.refIndex ?? target.index : target.index;
  const history = retries.filter((r) => r.resultId === result.id && r.kind === target.kind && r.targetIndex === targetIndex);
  const latest = history[history.length - 1] ?? null;
  const simulated = atlas.demoMode || result.source === "demo";

  const save = useCallback(
    (after: { accuracy: number | null; said: boolean }[], source: RetryRecord["source"], audio: Blob | null, clip: { offsetMs: number; durationMs: number } | null) => {
      const record: RetryRecord = {
        id: newId("retry"),
        date: new Date().toISOString(),
        resultId: result.id,
        kind: target.kind,
        targetIndex,
        text,
        before,
        after: mean(after.map((a) => (a.said ? a.accuracy : 0))),
        words: beforeWords.map((w, i) => ({
          text: bare(w.text),
          before: w.status === "omission" ? null : w.accuracy,
          after: after[i]?.said ? after[i]?.accuracy ?? null : null,
          status: statusOf(after[i]?.accuracy ?? null, after[i]?.said ?? false),
        })),
        source,
      };
      if (clip) record.clip = clip;
      learning.addRetry(record, audio);
    },
    [before, beforeWords, result.id, target.kind, targetIndex, text],
  );

  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (!outcome) return;
      const meta = { id: newId("retrytake"), createdAt: new Date().toISOString(), scriptId: result.scriptId, scriptTitle: result.scriptTitle, referenceText: text };
      const take = azure ? buildAssessmentResult(outcome.segments, meta) : buildTranscriptResult(outcome.transcript, outcome.durationMs, meta);
      const said = take.words.filter((w) => w.refIndex !== null);
      const timed = take.words.filter((w) => w.offsetMs !== null && w.durationMs !== null);
      const first = timed[0];
      const last = timed[timed.length - 1];
      const clip = first && last ? { offsetMs: first.offsetMs ?? 0, durationMs: (last.offsetMs ?? 0) + (last.durationMs ?? 0) - (first.offsetMs ?? 0) } : null;
      save(
        beforeWords.map((_, i) => ({ accuracy: said[i]?.accuracy ?? null, said: said[i] ? said[i].status !== "omission" : false })),
        take.source,
        outcome.audio,
        clip,
      );
    },
    [azure, beforeWords, result.scriptId, result.scriptTitle, save, text],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const recording = recorder.phase === "recording";

  const listen = useCallback(async () => {
    await player.playModel(text);
    setHeardModel(true);
  }, [player, text]);
  const record = useCallback(() => {
    if (heardModel) void recorder.start(text);
  }, [heardModel, recorder, text]);
  const simulate = useCallback(() => {
    save(simulateRetryScores(beforeWords).map((accuracy) => ({ accuracy, said: true })), "demo", null, null);
  }, [beforeWords, save]);

  const audio = latest ? getLearningAudio(latest.id) : null;
  const storedClip = latest?.clip;
  const clip: MineClip | null = audio && storedClip ? { blob: audio, ...storedClip } : null;

  useHotkeys({
    m: () => void listen(),
    space: recording ? recorder.stop : recorder.phase === "idle" && heardModel && !simulated ? record : undefined,
    enter: simulated && heardModel ? simulate : undefined,
    r: !simulated && heardModel && recorder.phase === "idle" ? record : simulated && heardModel ? simulate : undefined,
    p: clip ? () => void player.playMine(clip) : undefined,
    c: clip ? () => void player.compare(text, clip) : undefined,
    escape: onClose,
  });

  const delta = latest && latest.before !== null && latest.after !== null ? latest.after - latest.before : null;

  return (
    <section className="ticks border border-fg bg-bg" aria-label={`Retry: ${text}`}>
      <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3 sm:px-7">
        <Label as="h3">Fix it now · {target.kind === "word" ? "one word" : "one sentence"}</Label>
        <button type="button" onClick={onClose} className="label text-fg-3 hover:text-fg" aria-label="Close retry">
          Close · esc
        </button>
      </header>

      <div className="px-5 py-6 sm:px-7">
        <p className={target.kind === "word" ? "prompter !text-[3rem] !leading-none" : "prompter !text-[1.75rem] !leading-snug"}>{text}</p>

        {recorder.error && (
          <div className="mt-5">
            <ErrorState error={recorder.error} compact />
          </div>
        )}

        <div data-theme="stage" className="relative mt-6 bg-bg text-fg">
          <VoiceField stream={recorder.stream} active={recording} className="h-24" />
          <div className="absolute inset-0 flex flex-wrap items-center gap-3 px-4">
            <Button variant={heardModel ? "outline" : "solid"} onClick={() => void listen()} busy={player.playing === "model"} hotkey="M" disabled={recording}>
              {heardModel ? "Model again" : "Hear the model first"}
            </Button>
            {simulated ? (
              <Button variant="solid" onClick={simulate} disabled={!heardModel} hotkey="enter">
                {latest ? "Simulate another try" : "Simulate my retry"}
              </Button>
            ) : (
              <RecordControl phase={recorder.phase} onStart={record} onStop={recorder.stop} disabled={!heardModel} idleLabel={latest ? "Try again" : "Speak"} size="md" />
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-fg-3">
          {!heardModel
            ? "Listen first. The microphone opens after the model has played."
            : simulated
              ? "Demo: a sample retry stands in for your voice."
              : azure
                ? "Say just this part."
                : "Transcript-only mode: the words are checked, sounds are not scored."}
        </p>
        {player.note && <p className="mt-2 text-xs text-fg-3">{player.note}</p>}

        {latest && (
          <div className="mt-7 border-t border-rule pt-6" aria-live="polite">
            <div className="grid gap-6 sm:grid-cols-2">
              {(["before", "after"] as const).map((side) => {
                const score = side === "before" ? latest.before : latest.after;
                return (
                  <div key={side} className={side === "after" ? "sm:border-l sm:border-rule sm:pl-6" : ""}>
                    <div className="flex items-baseline justify-between gap-3">
                      <Label as="span">{side === "before" ? "Before" : `After${history.length > 1 ? ` · try ${history.length}` : ""}`}</Label>
                      {score !== null && <span className={`numeral text-4xl ${BAND_TEXT[band(score)]}`}>{Math.round(score)}</span>}
                    </div>
                    <p className="prompter mt-3 !text-[1.5rem] !leading-snug">
                      {latest.words.map((w, i) => {
                        const accuracy = side === "before" ? w.before : w.after;
                        const said = side === "before" ? w.before !== null || beforeWords[i]?.status !== "omission" : w.status !== "omission";
                        return (
                          <span key={i}>
                            <span className={wordClass({ status: said ? (accuracy !== null && accuracy < 60 ? "mispronounced" : "correct") : "omission", accuracy })}>{w.text}</span>{" "}
                          </span>
                        );
                      })}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              {delta !== null ? (
                <p className="text-base">
                  {delta >= 3 ? "Better." : delta <= -3 ? "Not this time. Hear the model once more, then go again." : "About the same. Slow it down and go again."}{" "}
                  <Delta value={delta} suffix=" points" />
                </p>
              ) : (
                <p className="text-base text-fg-2">Words compared. No sound scores in this mode.</p>
              )}
              {clip && (
                <>
                  <Button size="sm" onClick={() => void player.playMine(clip)} busy={player.playing === "mine"} hotkey="P">
                    Mine
                  </Button>
                  <Button size="sm" onClick={() => void player.compare(text, clip)} hotkey="C">
                    A then B
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
