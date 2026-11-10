/**
 * The single data model the UI and the coach route consume.
 * Azure's raw JSON never leaves `lib/azure/normalize.ts`.
 */

export type AppMode = "full" | "transcript" | "demo";

export interface AppConfig {
  /** Azure Speech key and region are both set on the server. */
  azure: boolean;
  /** Anthropic key is set on the server. */
  anthropic: boolean;
}

export type ScriptTag = "meeting" | "presentation" | "difficult conversation" | "Slack reply" | "drill";

export const SCRIPT_TAGS: readonly ScriptTag[] = [
  "meeting",
  "presentation",
  "difficult conversation",
  "Slack reply",
  "drill",
];

export interface Script {
  id: string;
  title: string;
  text: string;
  tags: ScriptTag[];
  createdAt: string;
  updatedAt: string;
}

export type WordStatus = "correct" | "mispronounced" | "omission" | "insertion";

export interface PhonemeAlternative {
  phoneme: string;
  score: number;
}

export interface PhonemeResult {
  /** Expected phoneme, IPA. */
  phoneme: string;
  /** 0 to 100. */
  accuracy: number;
  offsetMs: number;
  durationMs: number;
  /** What Azure thinks was actually said, best first. Empty if not returned. */
  alternatives: PhonemeAlternative[];
}

export interface WordProsody {
  /** Pause before this word that should not be there. */
  unexpectedBreak: boolean;
  /** No pause before this word where punctuation calls for one. */
  missingBreak: boolean;
  /** Azure flagged the utterance containing this word as monotone. */
  monotone: boolean;
}

export interface WordResult {
  /** Position in the merged, displayed sequence. */
  index: number;
  /** Text to display. Script spelling for script words, spoken text for insertions. */
  text: string;
  /** What was recognized, when it differs from the script word. */
  spoken: string | null;
  status: WordStatus;
  /** Index into the script's word list. Null for insertions. */
  refIndex: number | null;
  /** Sentence of the script this word belongs to. Null for insertions. */
  sentenceIndex: number | null;
  /** 0 to 100. Null for omissions and in transcript-only mode. */
  accuracy: number | null;
  /** Position in my recording. Null for omissions and in transcript-only mode. */
  offsetMs: number | null;
  durationMs: number | null;
  phonemes: PhonemeResult[];
  prosody: WordProsody | null;
}

export interface Scores {
  overall: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  /** Null when Azure returned no prosody score. */
  prosody: number | null;
}

export interface LongPause {
  /** Index (in `words`) of the word before the pause. */
  afterWordIndex: number;
  beforeWordIndex: number;
  durationMs: number;
  /** True when the pause sits on a sentence boundary of the script. */
  atSentenceBoundary: boolean;
}

export interface PacingStats {
  /** Words per minute over the spoken span. Null when it cannot be measured. */
  wordsPerMinute: number | null;
  spokenWordCount: number;
  /** First word start to last word end. */
  spanMs: number | null;
  /** Null when word timestamps are unavailable (transcript-only mode). */
  longPauses: LongPause[] | null;
  longPauseThresholdMs: number;
  /** True when WPM is estimated from total recording time, not word timestamps. */
  estimated: boolean;
}

export type ResultSource = "azure" | "transcript" | "demo";

export interface AssessmentResult {
  id: string;
  createdAt: string;
  scriptId: string;
  scriptTitle: string;
  referenceText: string;
  sentences: string[];
  source: ResultSource;
  recognizedText: string;
  /** Null in transcript-only mode. Never invented. */
  scores: Scores | null;
  words: WordResult[];
  pacing: PacingStats;
  /** Number of Azure recognition segments merged into this result. */
  segmentCount: number;
}

/** One recognized utterance from continuous recognition, already normalized. */
export interface Segment {
  offsetMs: number;
  durationMs: number;
  displayText: string;
  scores: {
    accuracy: number;
    fluency: number;
    completeness: number | null;
    prosody: number | null;
  };
  words: SegmentWord[];
}

export interface SegmentWord {
  text: string;
  accuracy: number | null;
  azureErrorType: string | null;
  offsetMs: number | null;
  durationMs: number | null;
  phonemes: PhonemeResult[];
  prosody: WordProsody | null;
}

/* ---------- history ---------- */

export interface PhonemeStat {
  count: number;
  /** Sum of accuracy scores, so averages can be merged across sessions. */
  sum: number;
  /** Occurrences scoring under the weak threshold. */
  lowCount: number;
  /** Up to three words where this sound scored lowest. */
  examples: string[];
}

export interface SessionRecord {
  id: string;
  date: string;
  scriptId: string;
  scriptTitle: string;
  source: ResultSource;
  scores: Scores | null;
  wordsPerMinute: number | null;
  longPauseCount: number | null;
  phonemeStats: Record<string, PhonemeStat>;
}

export interface WeakSound {
  phoneme: string;
  averageAccuracy: number;
  occurrences: number;
  lowCount: number;
  /** Sessions in which this sound averaged under the weak threshold. */
  weakSessions: number;
  sessions: number;
  examples: string[];
}

export interface HistoryExport {
  app: "speech-coach";
  version: 1;
  exportedAt: string;
  sessions: SessionRecord[];
  scripts: Script[];
}
