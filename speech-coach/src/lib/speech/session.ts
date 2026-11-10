import type { Segment } from "../types";
import type { AppError } from "../errors";

/** What the practice screen needs from a recording session, whichever engine runs it. */

export interface SessionCallbacks {
  /** Words heard so far in the utterance in progress (not final). */
  onPartial(text: string): void;
  /** An utterance was finalized. */
  onFinal(text: string): void;
  /** The session died and cannot continue. Whatever was captured is still returned by stop(). */
  onFatal(error: AppError): void;
}

export interface SessionOutcome {
  /** Azure segments. Empty in transcript-only mode. */
  segments: Segment[];
  /** Plain transcript. */
  transcript: string;
  audio: Blob | null;
  durationMs: number;
}

export interface RecordingSession {
  /** The single microphone stream, for the waveform. */
  stream: MediaStream;
  stop(): Promise<SessionOutcome>;
  /** Stop everything and throw the take away. */
  cancel(): void;
}
