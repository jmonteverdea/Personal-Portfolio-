"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "@/hooks/useAtlas";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTakeRecorder, type TakeFinished } from "@/hooks/useTakeRecorder";
import { DEMO_ANSWERS, demoTurn } from "@/lib/fixtures/demo-modes";
import { listEarVoices, speakWithVoice, type EarVoice } from "@/lib/learning/voices";
import { converse } from "@/lib/modes/api";
import { modes } from "@/lib/modes/store";
import { customScenario, pickCorrection, SCENARIOS, scriptedReply, turnFromOutcome, type Correction } from "@/lib/modes/talk";
import type { TalkTurn } from "@/lib/modes/types";
import { newId } from "@/lib/store";
import { useConfig } from "../ConfigContext";
import { Button, Label, LinkButton, Loading, Note, Spinner, StateBlock } from "../ds/ui";
import { ErrorState } from "../errorStates";
import { RecordControl } from "../RecordControl";
import { VoiceField } from "../voice/VoiceField";

/** Enough exchanges to practise, short enough to stay a warm-up. */
const MAX_MY_TURNS = 5;
const CLOSING = "Thanks, that covers it. Talk soon.";

type Phase = "intro" | "partner" | "me" | "ended";

export function Conversation() {
  const router = useRouter();
  const params = useSearchParams();
  const { azure, anthropic } = useConfig();
  const atlas = useAtlas();
  const scenario = useMemo(() => {
    const custom = params.get("custom");
    return custom ? customScenario(custom) : SCENARIOS.find((s) => s.id === params.get("s")) ?? null;
  }, [params]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [turns, setTurns] = useState<TalkTurn[]>([]);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [lineBusy, setLineBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  /** Undefined until the voice list has loaded, null when this device has none. */
  const [voice, setVoice] = useState<EarVoice | null | undefined>(undefined);
  const turnsRef = useRef<TalkTurn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void listEarVoices(azure).then((list) => {
      // A different voice from the drill model, so the partner sounds like another person.
      if (alive) setVoice(list[1] ?? list[0] ?? null);
    });
    return () => {
      alive = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [azure]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, correction]);

  const say = useCallback(async (text: string) => {
    if (!voice) return;
    setSpeaking(true);
    try {
      await speakWithVoice(text, voice);
    } catch {
      setNote("The partner's voice could not play. The text is on screen.");
    } finally {
      setSpeaking(false);
    }
  }, [voice]);

  const push = useCallback((turn: TalkTurn) => {
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  }, []);

  const partnerSays = useCallback(
    async (text: string, closes: boolean) => {
      push({ role: "partner", text, words: [], durationMs: 0, scores: null });
      setPhase(closes ? "ended" : "partner");
      await say(text);
      if (!closes) setPhase("me");
    },
    [push, say],
  );

  const begin = useCallback(() => {
    if (!scenario) return;
    void partnerSays(scenario.opening, false);
  }, [partnerSays, scenario]);

  const afterMyTurn = useCallback(
    async (turn: TalkTurn) => {
      if (!scenario) return;
      push(turn);
      setLine(null);
      setCorrection(pickCorrection(turn));
      const mine = turnsRef.current.filter((t) => t.role === "me").length;
      if (mine >= MAX_MY_TURNS) {
        await partnerSays(CLOSING, true);
        return;
      }
      setPhase("partner");
      let reply: { reply: string; done: boolean } | null = null;
      if (anthropic) {
        try {
          reply = await converse.reply({ title: scenario.title, setup: scenario.setup }, turnsRef.current.map((t) => ({ role: t.role, text: t.text })));
        } catch {
          setNote("Claude did not answer, so the scripted partner took over.");
        }
      }
      if (!reply) {
        const scripted = scriptedReply(scenario, mine);
        reply = scripted ? { reply: scripted, done: false } : { reply: CLOSING, done: true };
      }
      await partnerSays(reply.reply, reply.done);
    },
    [anthropic, partnerSays, push, scenario],
  );

  const onFinished = useCallback(
    ({ outcome }: TakeFinished) => {
      if (outcome) void afterMyTurn(turnFromOutcome(outcome));
    },
    [afterMyTurn],
  );
  const recorder = useTakeRecorder(azure, onFinished);
  const recording = recorder.phase === "recording";
  const myCount = turns.filter((t) => t.role === "me").length;

  const record = useCallback(() => {
    setCorrection(null);
    // No reference text: this is unscripted speech.
    void recorder.start("");
  }, [recorder]);

  const simulate = useCallback(() => {
    const answer = DEMO_ANSWERS[Math.min(myCount, DEMO_ANSWERS.length - 1)] as string;
    void afterMyTurn(demoTurn(answer));
  }, [afterMyTurn, myCount]);

  const giveLine = useCallback(async () => {
    if (!scenario || lineBusy) return;
    setLineBusy(true);
    try {
      if (anthropic) {
        const result = await converse.line({ title: scenario.title, setup: scenario.setup }, turnsRef.current.map((t) => ({ role: t.role, text: t.text })));
        setLine(result.line);
      } else {
        setLine(myCount === 0 ? scenario.sampleLine : "Let me give you the short version first, and then the detail.");
      }
    } catch {
      setLine(scenario.sampleLine);
    } finally {
      setLineBusy(false);
    }
  }, [anthropic, lineBusy, myCount, scenario]);

  const finish = useCallback(() => {
    if (!scenario) return;
    if (myCount === 0) {
      router.push("/speak");
      return;
    }
    const id = newId("talk");
    modes.addTalk({
      id,
      date: new Date().toISOString(),
      kind: "conversation",
      scenarioId: scenario.id,
      title: scenario.title,
      turns: turnsRef.current,
      source: atlas.demoMode ? "demo" : azure ? "azure" : "transcript",
      rewording: null,
    });
    router.push(`/talk/report?id=${encodeURIComponent(id)}`);
  }, [atlas.demoMode, azure, myCount, router, scenario]);

  const lastPartner = [...turns].reverse().find((t) => t.role === "partner");
  const myTurn = phase === "me" && recorder.phase !== "processing";

  useHotkeys(
    phase === "intro"
      ? { enter: begin, space: begin }
      : phase === "ended"
        ? { enter: finish, e: finish }
        : {
            space: atlas.demoMode ? undefined : recording ? recorder.stop : myTurn && recorder.phase === "idle" ? record : undefined,
            enter: atlas.demoMode && myTurn ? simulate : undefined,
            l: myTurn && !recording ? () => void giveLine() : undefined,
            m: lastPartner && !speaking && !recording ? () => void say(lastPartner.text) : undefined,
            e: !recording ? finish : undefined,
          },
  );

  if (!atlas.hydrated) return <Loading label="One moment" />;
  if (!scenario) {
    return (
      <StateBlock kind="empty" title="No scenario chosen." action={<LinkButton href="/speak" variant="solid">Pick a scenario</LinkButton>}>
        Choose a conversation from the Speak page.
      </StateBlock>
    );
  }

  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/speak" className="label text-fg-3 hover:text-fg">
          ← Speak
        </Link>
        <Label className="mt-8">Conversation</Label>
        <h1 className="display mt-3 text-(length:--text-display-m)">{scenario.title}</h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-2">
          The other person speaks first. Answer out loud, in your own words. You will get at most one small note per answer, so the talk keeps moving. The full report comes at the end.
        </p>
        <p className="label mt-5 text-fg-3">
          {anthropic ? "Partner: Claude" : "Partner: scripted questions · no Anthropic key"} · {azure ? "voice: Azure" : "voice: this browser"}
          {atlas.demoMode && " · demo: your answers are simulated"}
        </p>
        <div className="mt-9">
          <Button variant="solid" size="lg" onClick={begin} hotkey="enter">
            Start the conversation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Label as="span">{scenario.title}</Label>
        <Label as="span" className="ml-auto">
          {myCount} of up to {MAX_MY_TURNS} answers
        </Label>
      </div>

      <div className="flex-1 space-y-7 overflow-y-auto pb-4" data-lenis-prevent aria-live="polite">
        {turns.map((turn, i) => {
          const latest = i === turns.length - 1;
          return turn.role === "partner" ? (
            <div key={i}>
              <span className="label !text-model">Them</span>
              <p className={latest ? "prompter mt-1 !text-[clamp(1.6rem,1rem+2.2vw,2.75rem)] max-w-[26ch]" : "mt-1 max-w-2xl text-lg text-fg-2"}>{turn.text}</p>
            </div>
          ) : (
            <div key={i} className="border-l border-rule-strong pl-5">
              <span className="label text-fg-3">You</span>
              <p className="mt-1 max-w-2xl text-lg">{turn.text}</p>
            </div>
          );
        })}
        {phase === "partner" && turns[turns.length - 1]?.role === "me" && (
          <p className="flex items-center gap-3 text-fg-3">
            <Spinner /> <span className="label">Them</span>
          </p>
        )}
        {correction && phase !== "ended" && (
          <p className="max-w-2xl border border-rule-strong px-4 py-3 text-sm leading-relaxed text-fg-2" role="status">
            <span className="label mr-3 !text-signal">One note</span>
            {correction.message}
          </p>
        )}
        {line && myTurn && (
          <div className="max-w-2xl border border-model px-4 py-3">
            <span className="label !text-model">A line you could say</span>
            <p className="display mt-1 text-2xl leading-snug">{line}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {recorder.error && (
        <div className="mb-4">
          <ErrorState error={recorder.error} compact />
        </div>
      )}

      <div className="relative mt-4 border-t border-rule">
        <VoiceField stream={recorder.stream} active={recording} className="h-32" />
        <div className="absolute inset-0 flex flex-wrap items-center gap-3 px-1">
          {phase === "ended" ? (
            <Button variant="solid" size="lg" onClick={finish} hotkey="enter">
              See the delivery report
            </Button>
          ) : (
            <>
              {atlas.demoMode ? (
                <Button variant="solid" size="lg" onClick={simulate} disabled={!myTurn} hotkey="enter">
                  Simulate my answer
                </Button>
              ) : (
                <RecordControl phase={recorder.phase} onStart={record} onStop={recorder.stop} disabled={!myTurn && !recording} idleLabel="Answer" />
              )}
              <Button onClick={() => void giveLine()} busy={lineBusy} disabled={!myTurn || recording} hotkey="L">
                Give me a line
              </Button>
              <Button onClick={() => lastPartner && void say(lastPartner.text)} disabled={!lastPartner || speaking || recording} hotkey="M">
                Hear it again
              </Button>
              <Button variant="quiet" onClick={finish} disabled={recording} className="ml-auto">
                End{myCount > 0 ? " and see the report" : ""} · E
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 min-h-5 text-xs text-fg-3">
        {note ?? (atlas.demoMode ? "Demo: no microphone is used. Sample answers stand in for yours." : azure ? "Your audio goes to Azure Speech. With an Anthropic key, the transcript of each turn goes to Anthropic." : "Transcript-only: words are captured, sounds are not scored.")}
      </div>
      {voice === null && phase !== "ended" && (
        <div className="mt-3 max-w-xl">
          <Note>No voice is available on this device, so the partner&rsquo;s lines are shown as text only.</Note>
        </div>
      )}
    </div>
  );
}
