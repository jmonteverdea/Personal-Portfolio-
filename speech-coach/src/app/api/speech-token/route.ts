import { NextResponse } from "next/server";

/**
 * Exchanges AZURE_SPEECH_KEY for a short-lived auth token so the key itself
 * never reaches the browser. Azure tokens live for 10 minutes. We hand one out
 * for 9, then issue a fresh one.
 */

export const dynamic = "force-dynamic";

const TOKEN_USABLE_MS = 9 * 60 * 1000;
const AZURE_TIMEOUT_MS = 8000;

interface CachedToken {
  token: string;
  region: string;
  expiresAt: number;
}

let cache: CachedToken | null = null;

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim().toLowerCase();

  if (!key || !region) {
    const missing = [!key && "AZURE_SPEECH_KEY", !region && "AZURE_SPEECH_REGION"].filter(Boolean).join(" and ");
    return fail(
      503,
      "azure_not_configured",
      `${missing} ${key || region ? "is" : "are"} not set. Add ${key || region ? "it" : "them"} to .env.local and restart the dev server. Until then the app runs in transcript-only mode.`,
    );
  }
  if (!/^[a-z0-9]+$/.test(region)) {
    return fail(500, "azure_bad_region", `AZURE_SPEECH_REGION "${region}" is not a valid region name. Use the short form, for example eastus or westeurope.`);
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const now = Date.now();
  if (!force && cache && cache.region === region && cache.expiresAt > now) {
    return NextResponse.json(cache, { headers: { "Cache-Control": "no-store" } });
  }

  let response: Response;
  try {
    response = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0" },
      signal: AbortSignal.timeout(AZURE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return fail(
      502,
      "azure_unreachable",
      timedOut
        ? `Azure Speech did not answer within ${AZURE_TIMEOUT_MS / 1000} seconds. Check your connection and try again.`
        : `Could not reach Azure Speech in region "${region}". Check your connection and that the region is correct.`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    return fail(502, "azure_key_rejected", `Azure rejected the Speech key for region "${region}" (HTTP ${response.status}). Check that the key and region belong to the same Speech resource.`);
  }
  if (response.status === 429) {
    return fail(502, "azure_rate_limited", "Azure Speech is rate limiting this key. Wait a moment and try again.");
  }
  if (!response.ok) {
    return fail(502, "azure_token_failed", `Azure Speech returned HTTP ${response.status} when issuing a token.`);
  }

  const token = (await response.text()).trim();
  if (!token) return fail(502, "azure_token_failed", "Azure Speech returned an empty token.");

  cache = { token, region, expiresAt: now + TOKEN_USABLE_MS };
  return NextResponse.json(cache, { headers: { "Cache-Control": "no-store" } });
}
