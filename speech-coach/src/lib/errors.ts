/** Errors the UI knows how to explain. */
export type AppErrorCode =
  | "mic_denied"
  | "mic_missing"
  | "unsupported"
  | "no_speech"
  | "network"
  | "token"
  | "token_expired"
  | "not_configured"
  | "service";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(e: unknown, fallback = "Something went wrong."): AppError {
  if (e instanceof AppError) return e;
  return new AppError("service", e instanceof Error && e.message ? e.message : fallback);
}

/** getUserMedia failures, in plain words. */
export function micError(e: unknown): AppError {
  const name = e instanceof DOMException || e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new AppError("mic_denied", "Microphone access was blocked. Allow the microphone for this site in your browser's address bar, then try again.");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new AppError("mic_missing", "No microphone was found. Plug one in or check your system sound settings.");
  }
  if (name === "NotReadableError") {
    return new AppError("mic_missing", "The microphone is in use by another app or could not be started.");
  }
  return new AppError("mic_missing", "Could not start the microphone.");
}
