import { alignWords } from "../diff";
import { computePacing, estimatePacing } from "../pacing";
import { aggregateScores, MISPRONOUNCED_BELOW } from "../scoring";
import { normalizeWord, splitSentences, splitWords, tokenizeScript } from "../text";
import type {
  AssessmentResult,
  PhonemeResult,
  ResultSource,
  Segment,
  SegmentWord,
  WordProsody,
  WordResult,
} from "../types";

/**
 * Azure Speech raw JSON to the app's typed model. Pure: no SDK, no browser APIs.
 * This is the only file that knows Azure's field names.
 */

/** Azure reports Offset and Duration in 100-nanosecond ticks. */
const TICKS_PER_MS = 10_000;
/** Azure's suggested confidence threshold for break errors. */
const BREAK_CONFIDENCE = 0.75;

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function obj(v: unknown): Json {
  return isObj(v) ? v : {};
}
function ms(ticks: unknown): number | null {
  const n = num(ticks);
  return n === null ? null : n / TICKS_PER_MS;
}

function parsePhoneme(raw: unknown): PhonemeResult | null {
  const p = obj(raw);
  const phoneme = str(p.Phoneme);
  const pa = obj(p.PronunciationAssessment);
  const accuracy = num(pa.AccuracyScore);
  if (!phoneme || accuracy === null) return null;
  return {
    phoneme,
    accuracy,
    offsetMs: ms(p.Offset) ?? 0,
    durationMs: ms(p.Duration) ?? 0,
    alternatives: arr(pa.NBestPhonemes).flatMap((a) => {
      const alt = obj(a);
      const altPhoneme = str(alt.Phoneme);
      const score = num(alt.Score);
      return altPhoneme && score !== null ? [{ phoneme: altPhoneme, score }] : [];
    }),
  };
}

function parseProsody(wordAssessment: Json): WordProsody | null {
  const feedback = obj(obj(wordAssessment.Feedback).Prosody);
  if (Object.keys(feedback).length === 0) return null;
  const brk = obj(feedback.Break);
  const breakErrors = arr(brk.ErrorTypes);
  const unexpected = num(obj(brk.UnexpectedBreak).Confidence) ?? 0;
  const missing = num(obj(brk.MissingBreak).Confidence) ?? 0;
  return {
    unexpectedBreak: unexpected > BREAK_CONFIDENCE || breakErrors.includes("UnexpectedBreak"),
    missingBreak: missing > BREAK_CONFIDENCE || breakErrors.includes("MissingBreak"),
    monotone: arr(obj(feedback.Intonation).ErrorTypes).includes("Monotone"),
  };
}

function parseWord(raw: unknown): SegmentWord | null {
  const w = obj(raw);
  const text = str(w.Word);
  if (!text) return null;
  const pa = obj(w.PronunciationAssessment);
  return {
    text,
    accuracy: num(pa.AccuracyScore),
    azureErrorType: str(pa.ErrorType),
    offsetMs: ms(w.Offset),
    durationMs: ms(w.Duration),
    phonemes: arr(w.Phonemes).flatMap((p) => {
      const parsed = parsePhoneme(p);
      return parsed ? [parsed] : [];
    }),
    prosody: parseProsody(pa),
  };
}

/**
 * One `recognized` event's JSON (the SpeechServiceResponse_JsonResult property)
 * to a Segment. Returns null for anything that is not a successful recognition
 * with pronunciation data (silence, NoMatch, malformed JSON).
 */
export function parseAzureSegment(raw: unknown): Segment | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObj(data)) return null;
  const status = data.RecognitionStatus;
  if (status !== undefined && status !== "Success" && status !== 0) return null;

  const best = obj(arr(data.NBest)[0]);
  const pa = obj(best.PronunciationAssessment);
  const accuracy = num(pa.AccuracyScore);
  const fluency = num(pa.FluencyScore);
  const words = arr(best.Words).flatMap((w) => {
    const parsed = parseWord(w);
    return parsed ? [parsed] : [];
  });
  if (accuracy === null || fluency === null || words.length === 0) return null;

  return {
    offsetMs: ms(data.Offset) ?? words[0]?.offsetMs ?? 0,
    durationMs: ms(data.Duration) ?? 0,
    displayText: str(data.DisplayText) ?? str(best.Display) ?? words.map((w) => w.text).join(" "),
    scores: {
      accuracy,
      fluency,
      completeness: num(pa.CompletenessScore),
      prosody: num(pa.ProsodyScore),
    },
    words,
  };
}

export interface ResultMeta {
  id: string;
  createdAt: string;
  scriptId: string;
  scriptTitle: string;
  referenceText: string;
}

/**
 * Align spoken words to the script and tag each as correct, mispronounced,
 * omission or insertion. Shared by the Azure and transcript-only paths.
 */
export function mergeWithScript(referenceText: string, spoken: readonly SegmentWord[]): WordResult[] {
  const ref = tokenizeScript(referenceText);
  const heard = spoken.filter((w) => normalizeWord(w.text).length > 0);
  const ops = alignWords(
    ref.map((t) => t.norm),
    heard.map((w) => normalizeWord(w.text)),
  );

  const words: WordResult[] = [];
  for (const op of ops) {
    const index = words.length;
    if (op.type === "omission") {
      const token = ref[op.refIndex];
      if (!token) continue;
      words.push({
        index,
        text: token.display,
        spoken: null,
        status: "omission",
        refIndex: op.refIndex,
        sentenceIndex: token.sentenceIndex,
        accuracy: null,
        offsetMs: null,
        durationMs: null,
        phonemes: [],
        prosody: null,
      });
      continue;
    }

    const said = heard[op.hypIndex];
    if (!said) continue;
    const timing = { offsetMs: said.offsetMs, durationMs: said.durationMs };

    if (op.type === "insertion") {
      words.push({
        index,
        text: said.text,
        spoken: said.text,
        status: "insertion",
        refIndex: null,
        sentenceIndex: null,
        accuracy: said.accuracy,
        ...timing,
        phonemes: said.phonemes,
        prosody: said.prosody,
      });
      continue;
    }

    const token = ref[op.refIndex];
    if (!token) continue;
    const lowScore = said.accuracy !== null && said.accuracy < MISPRONOUNCED_BELOW;
    const mispronounced =
      op.type === "substitution" || lowScore || said.azureErrorType === "Mispronunciation";
    words.push({
      index,
      text: token.display,
      spoken: op.type === "substitution" ? said.text : null,
      status: mispronounced ? "mispronounced" : "correct",
      refIndex: op.refIndex,
      sentenceIndex: token.sentenceIndex,
      accuracy: said.accuracy,
      ...timing,
      phonemes: said.phonemes,
      prosody: said.prosody,
    });
  }
  return words;
}

/** Merge every continuous-recognition segment into one AssessmentResult. */
export function buildAssessmentResult(
  segments: readonly Segment[],
  meta: ResultMeta,
  source: ResultSource = "azure",
): AssessmentResult {
  const ordered = [...segments].sort((a, b) => a.offsetMs - b.offsetMs);
  const words = mergeWithScript(
    meta.referenceText,
    ordered.flatMap((s) => s.words),
  );
  return {
    ...meta,
    sentences: splitSentences(meta.referenceText),
    source,
    recognizedText: ordered.map((s) => s.displayText).join(" "),
    scores: aggregateScores(ordered, words, tokenizeScript(meta.referenceText).length),
    words,
    pacing: computePacing(words),
    segmentCount: ordered.length,
  };
}

/**
 * Transcript-only mode: a plain transcript, no scores, no timestamps.
 * Same word diff, and `scores` stays null so nothing is invented.
 */
export function buildTranscriptResult(
  transcript: string,
  recordingMs: number,
  meta: ResultMeta,
): AssessmentResult {
  const spoken: SegmentWord[] = splitWords(transcript).map((text) => ({
    text,
    accuracy: null,
    azureErrorType: null,
    offsetMs: null,
    durationMs: null,
    phonemes: [],
    prosody: null,
  }));
  const words = mergeWithScript(meta.referenceText, spoken);
  const spokenCount = words.filter((w) => w.status !== "omission").length;
  return {
    ...meta,
    sentences: splitSentences(meta.referenceText),
    source: "transcript",
    recognizedText: transcript.trim(),
    scores: null,
    words,
    pacing: estimatePacing(spokenCount, recordingMs),
    segmentCount: 0,
  };
}
