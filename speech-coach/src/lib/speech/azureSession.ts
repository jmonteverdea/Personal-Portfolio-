import type * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { parseAzureSegment } from "../azure/normalize";
import { AppError, micError } from "../errors";
import type { Segment } from "../types";
import { startTakeRecorder, stopStream } from "./recorder";
import type { RecordingSession, SessionCallbacks } from "./session";
import { clearSpeechToken, getSpeechToken } from "./token";

/**
 * Full mode. One getUserMedia stream feeds three consumers:
 *  1. the Azure recognizer (the SDK converts the MediaStream to 16 kHz PCM itself,
 *     so no WebM/Opus is ever sent to Azure),
 *  2. the waveform's AnalyserNode (the caller attaches it to `session.stream`),
 *  3. a MediaRecorder, for replaying the take locally.
 */

/** After asking Azure to stop, wait this long for the last `recognized` event. */
const FINAL_RESULT_WAIT_MS = 5000;
const TOKEN_RETRY_MS = 15_000;
/** The SDK retries a failed connection quietly for minutes. Do not leave me talking to nobody. */
const CONNECT_TIMEOUT_MS = 12_000;

export async function startAzureSession(referenceText: string, callbacks: SessionCallbacks): Promise<RecordingSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new AppError("unsupported", "This browser cannot record audio. Use a current version of Chrome or Edge.");
  }

  // Token first: if the server is misconfigured we find out before asking for the mic.
  const token = await getSpeechToken();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    throw micError(e);
  }

  let sdk: typeof SpeechSDK;
  try {
    sdk = await import("microsoft-cognitiveservices-speech-sdk");
  } catch {
    stopStream(stream);
    throw new AppError("network", "Could not load the Azure Speech SDK. Check your connection and reload.");
  }

  const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
  speechConfig.speechRecognitionLanguage = "en-US";
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;
  speechConfig.requestWordLevelTimestamps();

  const audioConfig = sdk.AudioConfig.fromStreamInput(stream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  // Every option explicit. enableMiscue stays off: it is not supported in
  // continuous mode, and miscues are computed by our own word diff instead.
  const assessment = new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark, // default is a 0 to 5 scale
    sdk.PronunciationAssessmentGranularity.Phoneme,
    false,
  );
  assessment.phonemeAlphabet = "IPA"; // default is SAPI
  assessment.nbestPhonemeCount = 5; // what was actually said, per phoneme
  assessment.enableProsodyAssessment = true; // a setter in the JS SDK, not a method
  assessment.applyTo(recognizer);

  const segments: Segment[] = [];
  const finals: string[] = [];
  let fatal: AppError | null = null;
  let finished = false;
  let sessionStopped: (() => void) | null = null;
  // Until Azure confirms the connection, failures reject start() instead of going to onFatal.
  let established = false;
  let failedEarly: (() => void) | null = null;
  const connection = sdk.Connection.fromRecognizer(recognizer);
  const connected = new Promise<boolean>((resolve) => {
    connection.connected = () => resolve(true);
    failedEarly = () => resolve(false);
  });
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const startedAt = performance.now();

  recognizer.recognizing = (_sender, event) => {
    if (!finished) callbacks.onPartial(event.result.text ?? "");
  };

  recognizer.recognized = (_sender, event) => {
    if (event.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
    const json = event.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
    const segment = parseAzureSegment(json);
    if (segment) segments.push(segment);
    if (event.result.text) {
      finals.push(event.result.text);
      if (!finished) callbacks.onFinal(event.result.text);
    }
  };

  recognizer.canceled = (_sender, event) => {
    if (event.reason !== sdk.CancellationReason.Error || finished) return;
    const code = event.errorCode;
    if (code === sdk.CancellationErrorCode.AuthenticationFailure || code === sdk.CancellationErrorCode.Forbidden) {
      clearSpeechToken();
      fatal = new AppError("token_expired", "Azure rejected the speech token (it may have expired). Press record to try again with a fresh one.");
    } else if (code === sdk.CancellationErrorCode.ConnectionFailure || code === sdk.CancellationErrorCode.ServiceTimeout) {
      fatal = new AppError("network", "The connection to Azure Speech dropped. Check your network and record again.");
    } else if (code === sdk.CancellationErrorCode.TooManyRequests) {
      fatal = new AppError("service", "Azure Speech is rate limiting this key. Wait a moment and record again.");
    } else {
      fatal = new AppError("service", `Azure Speech stopped the session: ${event.errorDetails || "unknown error"}`);
    }
    if (established) callbacks.onFatal(fatal);
    else failedEarly?.();
    sessionStopped?.();
  };

  recognizer.sessionStopped = () => sessionStopped?.();

  // Keep the token fresh for long takes: swap in a new one when ours reaches its 9-minute mark.
  const scheduleRefresh = (delayMs: number): void => {
    refreshTimer = setTimeout(() => {
      void getSpeechToken(true)
        .then((fresh) => {
          if (finished) return;
          recognizer.authorizationToken = fresh.token;
          scheduleRefresh(Math.max(fresh.expiresAt - Date.now(), TOKEN_RETRY_MS));
        })
        .catch(() => {
          if (!finished) scheduleRefresh(TOKEN_RETRY_MS);
        });
    }, delayMs);
  };
  scheduleRefresh(Math.max(token.expiresAt - Date.now(), 0));

  const teardown = (): void => {
    finished = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    try {
      recognizer.close();
    } catch {
      // already closed
    }
    stopStream(stream);
  };

  try {
    await new Promise<void>((resolve, reject) => recognizer.startContinuousRecognitionAsync(resolve, reject));
  } catch (e) {
    teardown();
    const detail = typeof e === "string" ? e : e instanceof Error ? e.message : "";
    if (/401|403|auth/i.test(detail)) {
      clearSpeechToken();
      throw new AppError("token_expired", "Azure rejected the speech token. Press record to try again with a fresh one.");
    }
    throw new AppError("network", `Could not start Azure Speech recognition. ${detail}`.trim());
  }

  const reached = await Promise.race([
    connected,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CONNECT_TIMEOUT_MS)),
  ]);
  if (!reached) {
    const early = fatal as AppError | null;
    const reason: AppError =
      early && early.code !== "network"
        ? early
        : new AppError(
        "network",
        `Could not connect to Azure Speech in region "${token.region}" within ${CONNECT_TIMEOUT_MS / 1000} seconds. Check your network, VPN or firewall, and that the key and region in .env.local belong to the same Speech resource.`,
      );
    clearSpeechToken();
    await new Promise<void>((resolve) => recognizer.stopContinuousRecognitionAsync(resolve, () => resolve()));
    teardown();
    throw reason;
  }
  established = true;

  const recorder = startTakeRecorder(stream);

  return {
    stream,
    async stop() {
      const durationMs = performance.now() - startedAt;
      const audio = (await recorder?.stop()) ?? null;
      if (!fatal) {
        const stopped = new Promise<void>((resolve) => {
          sessionStopped = resolve;
        });
        await new Promise<void>((resolve) => recognizer.stopContinuousRecognitionAsync(resolve, () => resolve()));
        await Promise.race([stopped, new Promise<void>((resolve) => setTimeout(resolve, FINAL_RESULT_WAIT_MS))]);
      }
      teardown();
      return { segments, transcript: finals.join(" "), audio, durationMs };
    },
    cancel() {
      void recorder?.stop();
      try {
        recognizer.stopContinuousRecognitionAsync(teardown, teardown);
      } catch {
        teardown();
      }
    },
  };
}
