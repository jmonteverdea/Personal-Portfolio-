import { describe, expect, it } from "vitest";
import { advanceCursor, alignWords } from "@/lib/diff";
import { mergeWithScript } from "@/lib/azure/normalize";
import { normalizeWord, normalizeWords, splitSentences, tokenizeScript } from "@/lib/text";
import type { SegmentWord } from "@/lib/types";

const spoken = (text: string, accuracy: number | null = 90): SegmentWord[] =>
  text.split(" ").filter(Boolean).map((w) => ({
    text: w, accuracy, azureErrorType: null, offsetMs: null, durationMs: null, phonemes: [], prosody: null,
  }));

const statuses = (script: string, said: string) =>
  mergeWithScript(script, spoken(said)).map((w) => `${normalizeWord(w.text)}:${w.status}`);

describe("text normalization", () => {
  it("ignores case and punctuation", () => {
    expect(normalizeWords("Hello, World! It's fine.")).toEqual(["hello", "world", "it's", "fine"]);
    expect(normalizeWords("“Quoted” (text) — dash; follow-up")).toEqual(["quoted", "text", "dash", "follow", "up"]);
    expect(normalizeWord("’Tis")).toBe("tis");
  });

  it("drops tokens that are only punctuation", () => {
    expect(normalizeWords("wait - what ... now")).toEqual(["wait", "what", "now"]);
  });

  it("splits sentences and tags words with their sentence", () => {
    expect(splitSentences("One two. Three four? Five!\nSix")).toEqual(["One two.", "Three four?", "Five!", "Six"]);
    expect(tokenizeScript("Hi there. Bye.").map((t) => t.sentenceIndex)).toEqual([0, 0, 1]);
  });
});

describe("alignWords", () => {
  it("matches identical sequences", () => {
    const ops = alignWords(["a", "b", "c"], ["a", "b", "c"]);
    expect(ops.every((o) => o.type === "match")).toBe(true);
  });

  it("handles empty inputs", () => {
    expect(alignWords([], [])).toEqual([]);
    expect(alignWords(["a"], [])).toEqual([{ type: "omission", refIndex: 0 }]);
    expect(alignWords([], ["a"])).toEqual([{ type: "insertion", hypIndex: 0 }]);
  });
});

describe("miscue detection against the script", () => {
  it("is case- and punctuation-insensitive", () => {
    expect(statuses("Good morning, everyone!", "good morning everyone")).toEqual([
      "good:correct", "morning:correct", "everyone:correct",
    ]);
  });

  it("tags an omission", () => {
    expect(statuses("The feedback is positive overall.", "the feedback is positive")).toEqual([
      "the:correct", "feedback:correct", "is:correct", "positive:correct", "overall:omission",
    ]);
  });

  it("tags an omission in the middle", () => {
    expect(statuses("We need three more weeks", "we need more weeks")).toEqual([
      "we:correct", "need:correct", "three:omission", "more:correct", "weeks:correct",
    ]);
  });

  it("tags an insertion and keeps it in spoken order", () => {
    const words = mergeWithScript("We need more time", spoken("we really need more time"));
    expect(words.map((w) => w.status)).toEqual(["correct", "insertion", "correct", "correct", "correct"]);
    expect(words[1]?.text).toBe("really");
    expect(words[1]?.refIndex).toBeNull();
    expect(words.map((w) => w.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("tags a repeated word as one insertion", () => {
    const out = statuses("weeks to finish testing", "weeks to to finish testing");
    expect(out.filter((s) => s.endsWith(":insertion"))).toEqual(["to:insertion"]);
    expect(out.filter((s) => s.endsWith(":correct"))).toHaveLength(4);
  });

  it("handles words the script itself repeats", () => {
    const out = statuses("the plan and the budget and the date", "the plan and the date");
    expect(out).toHaveLength(8);
    expect(out.filter((s) => s.endsWith(":omission"))).toHaveLength(3);
    expect(out).toContain("budget:omission");
    expect(out.filter((s) => s.endsWith(":correct"))).toHaveLength(5);
    expect(out.filter((s) => s.endsWith(":insertion"))).toHaveLength(0);
  });

  it("keeps every script word exactly once, in order", () => {
    const script = "No no no, that is not what I said. I said no.";
    const words = mergeWithScript(script, spoken("no no that is what i said said no"));
    const refIndexes = words.flatMap((w) => (w.refIndex === null ? [] : [w.refIndex]));
    expect(refIndexes).toEqual(tokenizeScript(script).map((_, i) => i));
    expect(words.filter((w) => w.status === "omission").map((w) => normalizeWord(w.text)).sort()).toEqual(["i", "no", "not"]);
    expect(words.filter((w) => w.status === "insertion").map((w) => w.text)).toEqual([]);
  });

  it("treats a similar-sounding wrong word as a mispronunciation, not a skip plus an extra", () => {
    const words = mergeWithScript("We shipped the beta", spoken("we sheeped the beta"));
    expect(words.map((w) => w.status)).toEqual(["correct", "mispronounced", "correct", "correct"]);
    expect(words[1]?.spoken).toBe("sheeped");
    expect(words[1]?.text).toBe("shipped");
  });

  it("treats an unrelated word as an omission plus an insertion", () => {
    const out = statuses("move the launch date", "move the banana date");
    expect(out).toContain("launch:omission");
    expect(out).toContain("banana:insertion");
  });

  it("marks low-accuracy matches as mispronounced", () => {
    const words = mergeWithScript("very quick", [...spoken("very", 41), ...spoken("quick", 88)]);
    expect(words.map((w) => w.status)).toEqual(["mispronounced", "correct"]);
  });

  it("returns only omissions when nothing was said", () => {
    expect(statuses("Hello there", "")).toEqual(["hello:omission", "there:omission"]);
  });
});

describe("advanceCursor", () => {
  const ref = normalizeWords("I think we need three more weeks to finish testing");
  it("advances through matching words", () => {
    expect(advanceCursor(ref, 0, ["i", "think", "we"])).toBe(3);
  });
  it("skips over a missed word", () => {
    expect(advanceCursor(ref, 0, ["i", "we", "need"])).toBe(4);
  });
  it("ignores words that are not in the script", () => {
    expect(advanceCursor(ref, 2, ["um", "banana"])).toBe(2);
  });
  it("does not jump far ahead on a common word", () => {
    expect(advanceCursor(ref, 0, ["testing"])).toBe(0);
  });
});
