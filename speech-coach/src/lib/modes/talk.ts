import { guideFor } from "../coach/local";
import type { SessionOutcome } from "../speech/session";
import { normalizeWord, splitWords } from "../text";
import { scanTokens } from "./delivery";
import { CLEAR } from "./scan";
import type { TalkTurn, TalkWord } from "./types";

/** Conversation and free talk: scenarios, turning a recording into a turn, and the one correction per turn. */

export interface Scenario {
  id: string;
  title: string;
  /** Who Claude plays, and the situation. */
  setup: string;
  /** The partner's first line. */
  opening: string;
  /** Follow-ups for the scripted partner used when there is no Claude key. Generic on purpose. */
  followUps: string[];
  /** One reply the "give me a line" button can offer when there is no Claude key. */
  sampleLine: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "standup",
    title: "Stand-up update",
    setup: "You are the team lead running a short daily stand-up. Ask what they finished, what is next, and what is blocking them. Be brisk and friendly.",
    opening: "Morning. What did you get done since yesterday?",
    followUps: ["Good. And what are you working on today?", "Is anything blocking you?", "Thanks. Anything you need from the rest of us?"],
    sampleLine: "Yesterday I finished the vendor review, and today I am starting the security checklist.",
  },
  {
    id: "deadline",
    title: "Pushing back on a deadline",
    setup: "You are a senior stakeholder who wants the project delivered two weeks earlier. Push, but stay reasonable and respond to good arguments.",
    opening: "I need this shipped by the fifteenth. Can you make that work?",
    followUps: ["What exactly would we lose if you rushed it?", "What would it take to hit the date anyway?", "All right. What date can you commit to?"],
    sampleLine: "I can ship a smaller version by the fifteenth, or the full scope two weeks later. Which matters more to you?",
  },
  {
    id: "client",
    title: "Client call",
    setup: "You are a client on a check-in call. You are mostly satisfied but want clarity on timeline and cost. Ask practical questions.",
    opening: "Thanks for joining. Can you walk me through where the project stands?",
    followUps: ["What are the main risks from here?", "Does that change the cost at all?", "What do you need from my side this week?"],
    sampleLine: "We are on schedule. The design is approved, and testing starts on Monday.",
  },
  {
    id: "interview",
    title: "Job interview",
    setup: "You are a hiring manager interviewing for a senior role. Ask one question at a time about experience, a hard project, and motivation.",
    opening: "Thanks for coming in. Tell me about yourself and what you do now.",
    followUps: ["Tell me about a project that did not go as planned.", "What would your last manager say you do best?", "Why this role, and why now?"],
    sampleLine: "I lead energy efficiency projects, and I enjoy turning complex programs into steps people can follow.",
  },
  {
    id: "smalltalk",
    title: "Small talk before a meeting",
    setup: "You are a colleague making relaxed small talk in the two minutes before a meeting starts. Keep it light: weekend, travel, weather, coffee.",
    opening: "Hey, good to see you. How was your weekend?",
    followUps: ["Nice. Did you do anything fun?", "Are you travelling at all this month?", "Sounds good. Shall we get started?"],
    sampleLine: "It was quiet, which I needed. I cooked on Saturday and went for a long walk on Sunday.",
  },
  {
    id: "explain",
    title: "Explaining a technical topic",
    setup: "You are a smart colleague from another department with no technical background. Ask the person to explain their topic simply, and ask follow-up questions when something is unclear.",
    opening: "I keep hearing about this in meetings. Can you explain it to me in plain words?",
    followUps: ["Why does that matter for the business?", "Can you give me a simple example?", "So what should I remember from all this?"],
    sampleLine: "In simple terms, we measure how much energy a building wastes, and then we fix the biggest leaks first.",
  },
];

export const FREE_PROMPTS: { id: string; title: string; prompt: string }[] = [
  { id: "week", title: "Your week", prompt: "Describe what you worked on this week and what went well." },
  { id: "project", title: "A project you are proud of", prompt: "Explain a project you are proud of: the problem, what you did, and the result." },
  { id: "decision", title: "A hard decision", prompt: "Talk about a hard decision you made at work and how you made it." },
  { id: "pitch", title: "Your role in one minute", prompt: "Explain what you do to someone you just met at a conference." },
  { id: "opinion", title: "An opinion", prompt: "Pick something your team should change, and argue for it." },
];

export function customScenario(line: string): Scenario {
  const trimmed = line.trim().slice(0, 240);
  return {
    id: "custom",
    title: trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed,
    setup: `Role-play this situation with the user, playing the other person: ${trimmed}. Stay in role and ask one thing at a time.`,
    opening: "Thanks for making the time. Where would you like to start?",
    followUps: ["Can you say more about that?", "What worries you most about it?", "What would you like to happen next?"],
    sampleLine: "Let me start with the main point, and then I will give you the details.",
  };
}

/** The scripted partner's next line, used when there is no Claude key. Null when it has nothing left to ask. */
export function scriptedReply(scenario: Scenario, myTurnsSoFar: number): string | null {
  return scenario.followUps[myTurnsSoFar - 1] ?? null;
}

/** Turn one recording into my turn of the talk. Works for both engines. */
export function turnFromOutcome(outcome: SessionOutcome): TalkTurn {
  const segments = [...outcome.segments].sort((a, b) => a.offsetMs - b.offsetMs);
  if (segments.length === 0) {
    return { role: "me", text: outcome.transcript.trim(), words: [], durationMs: Math.round(outcome.durationMs), scores: null };
  }
  const first = segments[0]?.words[0]?.offsetMs ?? 0;
  const words: TalkWord[] = segments.flatMap((s) =>
    s.words.map((w) => {
      const worst = [...w.phonemes].sort((a, b) => a.accuracy - b.accuracy)[0];
      const top = worst?.alternatives[0];
      return {
        text: w.text,
        offsetMs: w.offsetMs === null ? null : Math.max(0, w.offsetMs - first),
        durationMs: w.durationMs,
        accuracy: w.accuracy,
        worst: worst ? { phoneme: worst.phoneme, accuracy: worst.accuracy, heardAs: top && top.phoneme !== worst.phoneme ? top.phoneme : null } : null,
      };
    }),
  );
  const total = segments.reduce((n, s) => n + Math.max(1, s.durationMs), 0);
  const weighted = (pick: (s: (typeof segments)[number]) => number | null): number | null => {
    const parts = segments.flatMap((s) => {
      const v = pick(s);
      return v === null ? [] : [{ v, w: Math.max(1, s.durationMs) }];
    });
    const weight = parts.reduce((n, p) => n + p.w, 0);
    return weight ? Math.round((parts.reduce((n, p) => n + p.v * p.w, 0) / weight) * 10) / 10 : null;
  };
  const scored = words.filter((w) => w.accuracy !== null);
  return {
    role: "me",
    text: segments.map((s) => s.displayText).join(" ").trim(),
    words,
    durationMs: Math.round(Math.max(outcome.durationMs, total)),
    scores: {
      accuracy: scored.length ? Math.round((scored.reduce((n, w) => n + (w.accuracy ?? 0), 0) / scored.length) * 10) / 10 : 0,
      fluency: weighted((s) => s.scores.fluency) ?? 0,
      prosody: weighted((s) => s.scores.prosody),
    },
  };
}

export interface Correction {
  kind: "sound" | "filler" | "hedge";
  /** The word or phrase it is about. */
  about: string;
  message: string;
}

const FUNCTION_WORDS = new Set("a an the and or but so to of in on at for is are was were be i you he she it we they this that".split(" "));

/**
 * At most one correction per turn, for the single most important slip, so the
 * conversation keeps moving. A sound slip is only raised when there is
 * something physical to change. Everything else waits for the report.
 */
export function pickCorrection(turn: TalkTurn): Correction | null {
  const candidates = turn.words
    .filter((w) => w.accuracy !== null && w.accuracy < 60 && w.worst !== null && w.worst.accuracy < CLEAR && !FUNCTION_WORDS.has(normalizeWord(w.text)))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
  for (const word of candidates) {
    const worst = word.worst;
    const guide = worst ? guideFor(worst.phoneme) : null;
    if (!worst || !guide) continue;
    const habit = worst.heardAs ? guide.habits?.[worst.heardAs] : undefined;
    return { kind: "sound", about: word.text, message: `“${word.text}”: ${habit ?? guide.how}` };
  }
  const tokens = (turn.words.length ? turn.words.map((w) => w.text) : splitWords(turn.text)).map((w) => ({ norm: normalizeWord(w), atMs: null }));
  const found = scanTokens(tokens);
  const total = (map: Map<string, { count: number }>) => [...map.values()].reduce((n, c) => n + c.count, 0);
  const topOf = (map: Map<string, { text: string; count: number }>) => [...map.values()].sort((a, b) => b.count - a.count)[0];
  if (total(found.fillers) >= 3) {
    const top = topOf(found.fillers);
    return { kind: "filler", about: top?.text ?? "", message: `“${top?.text}” came up ${top?.count} times. Try a silent pause in its place.` };
  }
  if (total(found.hedges) >= 2) {
    const top = topOf(found.hedges);
    return { kind: "hedge", about: top?.text ?? "", message: `You softened it with “${top?.text}”. Say the point plainly.` };
  }
  return null;
}
