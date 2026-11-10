import { describe, expect, it } from "vitest";
import raw from "@/lib/fixtures/azure-segments.json";
import { buildAssessmentResult, buildTranscriptResult, parseAzureSegment } from "@/lib/azure/normalize";
import { DEMO_SCRIPT, demoSegments } from "@/lib/fixtures/demo";
import { tokenizeScript } from "@/lib/text";

const meta = {
  id: "t1",
  createdAt: "2026-11-09T15:30:00.000Z",
  scriptId: DEMO_SCRIPT.id,
  scriptTitle: DEMO_SCRIPT.title,
  referenceText: DEMO_SCRIPT.text,
};

describe("parseAzureSegment", () => {
  it("parses a raw segment, from an object or a JSON string", () => {
    const first = (raw as unknown[])[0];
    const seg = parseAzureSegment(first);
    expect(seg).not.toBeNull();
    expect(parseAzureSegment(JSON.stringify(first))).toEqual(seg);
    expect(seg?.displayText).toMatch(/^Good morning/);
    expect(seg?.words).toHaveLength(15);
    expect(seg?.scores.fluency).toBe(88);
    expect(seg?.scores.prosody).toBe(79);
  });

  it("converts 100-nanosecond ticks to milliseconds", () => {
    const first = (raw as { Offset: number; Duration: number }[])[0]!;
    const seg = parseAzureSegment(first)!;
    expect(seg.offsetMs).toBe(first.Offset / 10_000);
    expect(seg.durationMs).toBe(first.Duration / 10_000);
    expect(seg.words[0]?.offsetMs).toBe(620);
  });

  it("keeps IPA phonemes with scores and what was heard instead", () => {
    const very = parseAzureSegment((raw as unknown[])[0])!.words.find((w) => w.text === "very")!;
    expect(very.phonemes.map((p) => p.phoneme)).toEqual(["v", "ɛ", "r", "i"]);
    expect(very.phonemes[0]?.accuracy).toBe(24);
    expect(very.phonemes[0]?.alternatives[0]?.phoneme).toBe("b");
    expect(very.azureErrorType).toBe("Mispronunciation");
  });

  it("reads prosody feedback", () => {
    const segs = demoSegments();
    expect(segs[1]?.words.every((w) => w.prosody?.monotone)).toBe(true);
    expect(segs[0]?.words.some((w) => w.prosody?.monotone)).toBe(false);
    const three = segs[2]?.words.find((w) => w.text === "three");
    expect(three?.prosody?.unexpectedBreak).toBe(true);
  });

  it("returns null for silence, failures and garbage", () => {
    expect(parseAzureSegment({ RecognitionStatus: "InitialSilenceTimeout", Offset: 0, Duration: 0 })).toBeNull();
    expect(parseAzureSegment({ RecognitionStatus: "Success", NBest: [{ Words: [] }] })).toBeNull();
    expect(parseAzureSegment("not json")).toBeNull();
    expect(parseAzureSegment(null)).toBeNull();
    expect(parseAzureSegment([])).toBeNull();
  });

  it("tolerates a segment with no prosody or phoneme data", () => {
    const seg = parseAzureSegment({
      RecognitionStatus: "Success", Offset: 1_000_000, Duration: 5_000_000, DisplayText: "Hello.",
      NBest: [{ PronunciationAssessment: { AccuracyScore: 90, FluencyScore: 95 }, Words: [
        { Word: "hello", Offset: 1_000_000, Duration: 5_000_000, PronunciationAssessment: { AccuracyScore: 90, ErrorType: "None" } },
      ] }],
    });
    expect(seg?.scores.prosody).toBeNull();
    expect(seg?.words[0]?.prosody).toBeNull();
    expect(seg?.words[0]?.phonemes).toEqual([]);
  });
});

describe("buildAssessmentResult (multi-segment)", () => {
  const result = buildAssessmentResult(demoSegments(), meta);
  const refCount = tokenizeScript(DEMO_SCRIPT.text).length;

  it("merges all segments into one result", () => {
    expect(result.segmentCount).toBe(3);
    expect(result.recognizedText).toMatch(/^Good morning.*launch date\.$/);
    expect(result.sentences).toHaveLength(4);
    expect(result.source).toBe("azure");
  });

  it("orders segments by time even if events arrive out of order", () => {
    const shuffled = buildAssessmentResult([...demoSegments()].reverse(), meta);
    expect(shuffled.words.map((w) => w.text)).toEqual(result.words.map((w) => w.text));
  });

  it("covers every script word once and flags the miscues", () => {
    expect(result.words.filter((w) => w.refIndex !== null)).toHaveLength(refCount);
    expect(result.words.filter((w) => w.status === "omission").map((w) => w.text)).toEqual(["overall."]);
    expect(result.words.filter((w) => w.status === "insertion").map((w) => w.text)).toEqual(["the", "to"]);
    expect(result.words.map((w) => w.index)).toEqual(result.words.map((_, i) => i));
  });

  it("uses script spelling and keeps per-word timing", () => {
    expect(result.words[1]?.text).toBe("morning,");
    const first = result.words[0]!;
    expect(first.offsetMs).toBe(620);
    expect(first.durationMs).toBeGreaterThan(0);
    const omitted = result.words.find((w) => w.status === "omission")!;
    expect(omitted.offsetMs).toBeNull();
    expect(omitted.accuracy).toBeNull();
  });

  it("marks low words as mispronounced", () => {
    const bad = result.words.filter((w) => w.status === "mispronounced").map((w) => w.text);
    expect(bad).toContain("shipped");
    expect(bad).toContain("this");
    expect(result.words.find((w) => w.text === "Good")?.status).toBe("correct");
  });

  it("assigns sentence indexes from the script", () => {
    expect(result.words.find((w) => w.text === "everyone.")?.sentenceIndex).toBe(0);
    expect(result.words.find((w) => w.text === "shipped")?.sentenceIndex).toBe(2);
    expect(result.words.find((w) => w.text === "date.")?.sentenceIndex).toBe(3);
  });
});

describe("buildTranscriptResult", () => {
  const result = buildTranscriptResult("good morning everyone I want to give a quick update", 6000, meta);
  it("never invents scores", () => {
    expect(result.scores).toBeNull();
    expect(result.words.every((w) => w.accuracy === null && w.phonemes.length === 0)).toBe(true);
    expect(result.source).toBe("transcript");
  });
  it("still runs the word diff", () => {
    expect(result.words.find((w) => w.text === "very")?.status).toBe("omission");
    expect(result.words.find((w) => w.text === "Good")?.status).toBe("correct");
  });
  it("estimates pace from recording length and reports no pauses", () => {
    expect(result.pacing.estimated).toBe(true);
    expect(result.pacing.wordsPerMinute).toBe(100);
    expect(result.pacing.longPauses).toBeNull();
  });
});
