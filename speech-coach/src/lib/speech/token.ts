import { readError } from "../api";
import { AppError } from "../errors";

/** Browser-side cache for the short-lived Azure token from /api/speech-token. */

export interface SpeechToken {
  token: string;
  region: string;
  /** When to stop using it (9 minutes after issue, 1 minute before Azure expires it). */
  expiresAt: number;
}

/** Do not start a session on a token with less than this left. */
const MIN_REMAINING_MS = 20_000;

let cached: SpeechToken | null = null;

export async function getSpeechToken(force = false): Promise<SpeechToken> {
  if (!force && cached && cached.expiresAt - Date.now() > MIN_REMAINING_MS) return cached;

  // If our copy is stale the server's copy is too, so ask it for a fresh one.
  const bypass = force || cached !== null;
  let response: Response;
  try {
    response = await fetch(`/api/speech-token${bypass ? "?force=1" : ""}`, { cache: "no-store" });
  } catch {
    throw new AppError("network", "Could not reach the app server for a speech token. Is the dev server still running?");
  }
  if (!response.ok) {
    const { code, message } = await readError(response);
    cached = null;
    throw new AppError(code === "azure_not_configured" ? "not_configured" : code === "azure_unreachable" ? "network" : "token", message);
  }
  const body = (await response.json()) as Partial<SpeechToken>;
  if (typeof body.token !== "string" || typeof body.region !== "string" || typeof body.expiresAt !== "number") {
    throw new AppError("token", "The speech token response was malformed.");
  }
  cached = { token: body.token, region: body.region, expiresAt: body.expiresAt };
  return cached;
}

export function clearSpeechToken(): void {
  cached = null;
}
