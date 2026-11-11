import { normalizeWord, splitSentences, normalizeWords } from "../text";
import type { AssessmentResult, Script } from "../types";
import type { DrillStage } from "./types";

/**
 * Drill material per sound, in the order adults learn it: the sound alone in
 * minimal pairs, then mixed with other sounds, then inside real sentences.
 */

export interface MinimalPair {
  /** Word containing the target sound. */
  target: string;
  /** The same word with the sound Spanish speakers usually substitute. */
  contrast: string;
}

export interface SoundContent {
  /** IPA of the sound usually substituted, for labels. */
  contrastSound: string;
  pairs: MinimalPair[];
  /** Words with the sound alternate with words without it, starting with one that has it. */
  mixed: string[];
  /** Used only when none of my own scripts contain the sound. */
  sentence: string;
}

const CONTENT: Record<string, SoundContent> = {
  v: { contrastSound: "b", pairs: [{ target: "very", contrast: "berry" }, { target: "van", contrast: "ban" }, { target: "vest", contrast: "best" }, { target: "vote", contrast: "boat" }], mixed: ["value", "market", "seven", "people", "review", "team", "move"], sentence: "We have a very valuable vendor review to deliver this evening." },
  b: { contrastSound: "v", pairs: [{ target: "best", contrast: "vest" }, { target: "boat", contrast: "vote" }, { target: "ban", contrast: "van" }], mixed: ["budget", "seven", "about", "plan", "problem", "over", "job"], sentence: "Both boards believe the budget is better than before." },
  θ: { contrastSound: "t", pairs: [{ target: "three", contrast: "tree" }, { target: "thank", contrast: "tank" }, { target: "thin", contrast: "tin" }, { target: "both", contrast: "boat" }], mixed: ["think", "time", "month", "team", "thought", "cost", "growth"], sentence: "I think three things are worth our thought this month." },
  ð: { contrastSound: "d", pairs: [{ target: "they", contrast: "day" }, { target: "then", contrast: "den" }, { target: "though", contrast: "dough" }, { target: "there", contrast: "dare" }], mixed: ["this", "data", "other", "order", "that", "today", "rather"], sentence: "This is the other option, and that is the one they prefer." },
  ɪ: { contrastSound: "i", pairs: [{ target: "ship", contrast: "sheep" }, { target: "live", contrast: "leave" }, { target: "fill", contrast: "feel" }, { target: "sit", contrast: "seat" }], mixed: ["this", "team", "finish", "week", "list", "need", "system"], sentence: "We shipped it this week, and the list is still with him." },
  i: { contrastSound: "ɪ", pairs: [{ target: "sheep", contrast: "ship" }, { target: "leave", contrast: "live" }, { target: "feel", contrast: "fill" }, { target: "seat", contrast: "sit" }], mixed: ["team", "this", "need", "list", "week", "bill", "meet"], sentence: "We need the team to meet each week and keep me in the email." },
  z: { contrastSound: "s", pairs: [{ target: "zoo", contrast: "sue" }, { target: "prize", contrast: "price" }, { target: "eyes", contrast: "ice" }, { target: "buzz", contrast: "bus" }], mixed: ["is", "cost", "reasons", "class", "easy", "plus", "design"], sentence: "The results are positive, and these numbers raise zero concerns." },
  ʃ: { contrastSound: "tʃ", pairs: [{ target: "ship", contrast: "chip" }, { target: "share", contrast: "chair" }, { target: "wash", contrast: "watch" }, { target: "cash", contrast: "catch" }], mixed: ["share", "check", "push", "each", "shift", "watch", "show"], sentence: "She will share the schedule and show the shareholders a short list." },
  tʃ: { contrastSound: "ʃ", pairs: [{ target: "chip", contrast: "ship" }, { target: "chair", contrast: "share" }, { target: "watch", contrast: "wash" }, { target: "catch", contrast: "cash" }], mixed: ["check", "share", "each", "push", "launch", "show", "change"], sentence: "Check each chart before the launch and choose which change to make." },
  dʒ: { contrastSound: "j", pairs: [{ target: "jet", contrast: "yet" }, { target: "jeer", contrast: "year" }, { target: "juice", contrast: "use" }], mixed: ["project", "year", "budget", "you", "manage", "yes", "June"], sentence: "The project budget is just large enough to manage the major changes." },
  j: { contrastSound: "dʒ", pairs: [{ target: "yet", contrast: "jet" }, { target: "year", contrast: "jeer" }, { target: "use", contrast: "juice" }], mixed: ["year", "project", "you", "budget", "yes", "manage", "usual"], sentence: "Yes, you can use it this year, as your unit usually does." },
  ŋ: { contrastSound: "n", pairs: [{ target: "thing", contrast: "thin" }, { target: "wing", contrast: "win" }, { target: "rang", contrast: "ran" }, { target: "sung", contrast: "sun" }], mixed: ["meeting", "plan", "testing", "soon", "long", "then", "bring"], sentence: "The meeting is running long, so bring the pricing along." },
  ʊ: { contrastSound: "u", pairs: [{ target: "look", contrast: "Luke" }, { target: "pull", contrast: "pool" }, { target: "full", contrast: "fool" }], mixed: ["would", "group", "good", "soon", "look", "move", "put"], sentence: "I would look at the full book before we put it in." },
  æ: { contrastSound: "ɛ", pairs: [{ target: "bad", contrast: "bed" }, { target: "man", contrast: "men" }, { target: "pan", contrast: "pen" }, { target: "sad", contrast: "said" }], mixed: ["plan", "next", "back", "send", "add", "set", "feedback"], sentence: "The plan is back on track, and thanks for the feedback on the app." },
  ʌ: { contrastSound: "ɑ", pairs: [{ target: "cup", contrast: "cop" }, { target: "luck", contrast: "lock" }, { target: "nut", contrast: "not" }, { target: "bus", contrast: "boss" }], mixed: ["update", "top", "budget", "job", "month", "stop", "number"], sentence: "One update on the budget this month: the number is up." },
  h: { contrastSound: "silence", pairs: [{ target: "hold", contrast: "old" }, { target: "hear", contrast: "ear" }, { target: "heat", contrast: "eat" }, { target: "hair", contrast: "air" }], mixed: ["have", "our", "help", "end", "hire", "always", "whole"], sentence: "He hopes the handoff happens here in half an hour." },
  t: { contrastSound: "silence", pairs: [{ target: "date", contrast: "day" }, { target: "plate", contrast: "play" }, { target: "fact", contrast: "fax" }, { target: "eight", contrast: "a" }], mixed: ["start", "day", "cost", "pay", "draft", "new", "sent"], sentence: "The start date is set, and I sent the draft at eight last night." },
  d: { contrastSound: "t", pairs: [{ target: "ride", contrast: "write" }, { target: "need", contrast: "neat" }, { target: "wide", contrast: "white" }, { target: "said", contrast: "set" }], mixed: ["would", "what", "need", "meet", "signed", "sent", "agreed"], sentence: "We would need a signed bid by the end of the period." },
  k: { contrastSound: "ɡ", pairs: [{ target: "back", contrast: "bag" }, { target: "pick", contrast: "pig" }, { target: "lock", contrast: "log" }], mixed: ["feedback", "big", "week", "flag", "risk", "blog", "task"], sentence: "Take a look at the risk and check the link this week." },
  r: { contrastSound: "l", pairs: [{ target: "right", contrast: "light" }, { target: "read", contrast: "lead" }, { target: "road", contrast: "load" }, { target: "grass", contrast: "glass" }], mixed: ["review", "list", "report", "late", "ready", "plan", "release"], sentence: "The review report is ready, so read the right version before Friday." },
};

/** Azure reports r-colored vowels and the English r under several symbols. */
const ALIASES: Record<string, string> = { ɹ: "r", ɚ: "r", ɝ: "r", g: "k" };

export function contentFor(phoneme: string): SoundContent | null {
  const key = phoneme.replace(/[/\s]/g, "");
  return CONTENT[key] ?? CONTENT[ALIASES[key] ?? ""] ?? null;
}

/** The words in the mixed list that contain the sound: every other one, starting with the first. */
export function mixedTargets(phoneme: string): string[] {
  return (contentFor(phoneme)?.mixed ?? []).filter((_, i) => i % 2 === 0);
}

export function hasPairs(phoneme: string): boolean {
  return (contentFor(phoneme)?.pairs.length ?? 0) > 0;
}

/** Words from my own takes and the built-in material that are known to contain the sound. */
export function wordsWithSound(phoneme: string, results: readonly AssessmentResult[], examples: readonly string[] = []): Set<string> {
  const words = new Set<string>();
  for (const result of results) {
    for (const w of result.words) {
      if (w.status !== "insertion" && w.phonemes.some((p) => p.phoneme === phoneme)) words.add(normalizeWord(w.text));
    }
  }
  for (const e of examples) words.add(normalizeWord(e));
  const content = contentFor(phoneme);
  for (const pair of content?.pairs ?? []) words.add(normalizeWord(pair.target));
  for (const word of mixedTargets(phoneme)) words.add(normalizeWord(word));
  words.delete("");
  return words;
}

const MAX_SENTENCE_WORDS = 28;

/**
 * Sentences from my own scripts that contain the sound, richest first.
 * This is what "real sentences" means: my words, not a textbook's.
 */
export function sentencesFromScripts(scripts: readonly Script[], known: ReadonlySet<string>, max = 2): string[] {
  const scored: { sentence: string; hits: number }[] = [];
  const seen = new Set<string>();
  for (const script of scripts) {
    if (script.tags.includes("drill")) continue;
    for (const sentence of splitSentences(script.text)) {
      const words = normalizeWords(sentence);
      if (words.length < 4 || words.length > MAX_SENTENCE_WORDS || seen.has(sentence)) continue;
      const hits = words.filter((w) => known.has(w)).length;
      if (hits > 0) {
        seen.add(sentence);
        scored.push({ sentence, hits });
      }
    }
  }
  return scored.sort((a, b) => b.hits - a.hits || a.sentence.length - b.sentence.length).slice(0, max).map((s) => s.sentence);
}

export interface StageMaterial {
  stage: DrillStage;
  title: string;
  /** What I read out loud. */
  text: string;
  /** Words to play as the model, in order. */
  modelParts: string[];
  /** True when the sentences came from my own scripts. */
  fromMyScripts: boolean;
}

/** The text for one drill stage. Falls back to my missed words when there is no built-in material. */
export function stageMaterial(
  phoneme: string,
  stage: DrillStage,
  options: { scripts?: readonly Script[]; results?: readonly AssessmentResult[]; examples?: readonly string[] } = {},
): StageMaterial {
  const content = contentFor(phoneme);
  const examples = [...new Set((options.examples ?? []).map((e) => e.trim()).filter(Boolean))].slice(0, 4);

  if (stage === "pairs") {
    if (content) {
      const pairs = content.pairs.slice(0, 3);
      return {
        stage,
        title: "The sound alone",
        text: pairs.map((p) => `${p.contrast}, ${p.target}.`).join(" "),
        modelParts: pairs.flatMap((p) => [p.contrast, p.target]),
        fromMyScripts: false,
      };
    }
    const words = examples.length ? examples : [phoneme];
    return { stage, title: "The sound alone", text: `${words.join(". ")}. ${words.join(". ")}.`, modelParts: words, fromMyScripts: false };
  }

  if (stage === "mixed") {
    const words = content ? content.mixed : [...examples, "today", "people", "market"].slice(0, 6);
    return { stage, title: "Mixed with other sounds", text: `${words.join(", ")}.`, modelParts: words, fromMyScripts: false };
  }

  const known = wordsWithSound(phoneme, options.results ?? [], examples);
  const mine = sentencesFromScripts(options.scripts ?? [], known);
  if (mine.length > 0) {
    return { stage, title: "In your own sentences", text: mine.join(" "), modelParts: mine, fromMyScripts: true };
  }
  const fallback = content?.sentence ?? `${examples.join(", ")}.`;
  return { stage, title: "In a sentence", text: fallback, modelParts: [fallback], fromMyScripts: false };
}
