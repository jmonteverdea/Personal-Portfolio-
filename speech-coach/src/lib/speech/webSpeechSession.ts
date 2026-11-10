import { AppError, micError } from "../errors";
import { startTakeRecorder, stopStream } from "./recorder";
import type { RecordingSession, SessionCallbacks } from "./session";

/**
 * Transcript-only mode: the browser's Web Speech API gives a transcript, nothing more.
 * No scores are produced here. A separate getUserMedia stream drives the waveform
 * and the local MediaRecorder, because Web Speech manages its own microphone access.
 */

interface WebSpeechAlternative {
  transcript: string;
}
interface WebSpeechResult {
  isFinal: boolean;
  0: WebSpeechAlternative;
}
interface WebSpeechEvent {
  resultIndex: number;
  results: { length: number; [index: number]: WebSpeechResult };
}
interface WebSpeechErrorEvent {
  error: string;
}
interface WebSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: WebSpeechEvent) => void) | null;
  onerror: ((event: WebSpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type WebSpeechCtor = new () => WebSpeechRecognition;

function getCtor(): WebSpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: WebSpeechCtor; webkitSpeechRecognition?: WebSpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function webSpeechSupported(): boolean {
  return typeof window !== "undefined" && getCtor() !== null;
}

export async function startWebSpeechSession(callbacks: SessionCallbacks): Promise<RecordingSession> {
  const Ctor = getCtor();
  if (!Ctor) {
    throw new AppError("unsupported", "This browser has no built-in speech recognition. Use Chrome or Edge for transcript-only mode, or add an Azure Speech key.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new AppError("unsupported", "This browser cannot record audio. Use a current version of Chrome or Edge.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    throw micError(e);
  }

  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  const finals: string[] = [];
  let active = true;
  let fatal = false;
  let ended: (() => void) | null = null;
  const startedAt = performance.now();

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      const text = result[0].transcript.trim();
      if (result.isFinal) {
        if (text) {
          finals.push(text);
          callbacks.onFinal(text);
        }
      } else {
        interim += ` ${text}`;
      }
    }
    callbacks.onPartial(interim.trim());
  };

  recognition.onerror = (event) => {
    if (!active) return;
    // "no-speech" and "aborted" are routine: the engine restarts in onend.
    if (event.error === "no-speech" || event.error === "aborted") return;
    fatal = true;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      callbacks.onFatal(new AppError("mic_denied", "The browser blocked speech recognition. Allow the microphone for this site and try again."));
    } else if (event.error === "network") {
      callbacks.onFatal(new AppError("network", "The browser's speech recognition service is unreachable. Check your connection."));
    } else if (event.error === "audio-capture") {
      callbacks.onFatal(new AppError("mic_missing", "No microphone was found."));
    } else {
      callbacks.onFatal(new AppError("service", `Browser speech recognition failed (${event.error}).`));
    }
  };

  recognition.onend = () => {
    // Chrome ends a "continuous" session after a stretch of silence. Keep going until I press stop.
    if (active && !fatal) {
      try {
        recognition.start();
        return;
      } catch {
        // fall through and end
      }
    }
    ended?.();
  };

  try {
    recognition.start();
  } catch {
    stopStream(stream);
    throw new AppError("service", "Could not start browser speech recognition.");
  }

  const recorder = startTakeRecorder(stream);

  return {
    stream,
    async stop() {
      const durationMs = performance.now() - startedAt;
      active = false;
      const done = new Promise<void>((resolve) => {
        ended = resolve;
      });
      try {
        recognition.stop();
      } catch {
        ended?.();
      }
      await Promise.race([done, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
      const audio = (await recorder?.stop()) ?? null;
      stopStream(stream);
      return { segments: [], transcript: finals.join(" "), audio, durationMs };
    },
    cancel() {
      active = false;
      try {
        recognition.abort();
      } catch {
        // not running
      }
      void recorder?.stop();
      stopStream(stream);
    },
  };
}
