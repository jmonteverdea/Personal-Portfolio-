import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import type { z } from "zod";
import {
  COACH_SYSTEM, coachUserMessage, DRILL_SYSTEM, drillUserMessage, retryMessage, SCENARIO_SYSTEM, scenarioUserMessage,
} from "@/lib/coach/prompts";
import { CoachingSchema, CoachRequestSchema, DrillSchema, parseModelJson, ScenarioSchema } from "@/lib/coach/schema";

/**
 * The only place Anthropic is called. Three tasks: coach a take, write a
 * roleplay scenario, write a drill for one sound. Each reply is validated
 * against a schema, retried once if invalid, then reported as an error.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 8000;

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

class ModelOutputError extends Error {}

async function ask<T>(client: Anthropic, model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\n${retryMessage(lastError)}` }],
      output_config: { format: zodOutputFormat(schema) },
    });

    if (response.stop_reason === "refusal") {
      throw new ModelOutputError("Claude declined this request. Try rewording the script or prompt.");
    }
    const raw = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    if (response.stop_reason === "max_tokens") {
      lastError = "The reply was cut off before the JSON was complete. Be more concise.";
      continue;
    }
    const parsed = parseModelJson(raw, schema);
    if (parsed.ok) return parsed.data;
    lastError = parsed.error;
  }
  throw new ModelOutputError(`Claude returned a response that failed validation twice. ${lastError}`);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return fail(503, "anthropic_not_configured", "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server to turn on coaching and script generation.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "The request body is not valid JSON.");
  }
  const input = CoachRequestSchema.safeParse(body);
  if (!input.success) {
    const issue = input.error.issues[0];
    return fail(400, "bad_request", `Invalid request: ${issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "unknown shape"}.`);
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });

  try {
    const req = input.data;
    if (req.task === "coach") {
      return NextResponse.json({ data: await ask(client, model, COACH_SYSTEM, coachUserMessage(req.summary, req.avoid), CoachingSchema) });
    }
    if (req.task === "scenario") {
      return NextResponse.json({ data: await ask(client, model, SCENARIO_SYSTEM, scenarioUserMessage(req.prompt), ScenarioSchema) });
    }
    return NextResponse.json({ data: await ask(client, model, DRILL_SYSTEM, drillUserMessage(req.phoneme, req.examples), DrillSchema) });
  } catch (error) {
    if (error instanceof ModelOutputError) return fail(502, "invalid_model_output", error.message);
    if (error instanceof Anthropic.AuthenticationError) {
      return fail(502, "anthropic_key_rejected", "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.");
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return fail(502, "anthropic_forbidden", `This API key cannot use the model "${model}". Check ANTHROPIC_MODEL.`);
    }
    if (error instanceof Anthropic.NotFoundError) {
      return fail(502, "anthropic_model_not_found", `The model "${model}" was not found. Check ANTHROPIC_MODEL.`);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return fail(429, "anthropic_rate_limited", "Anthropic is rate limiting this key. Wait a moment and try again.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      return fail(502, "anthropic_bad_request", `Anthropic rejected the request for model "${model}": ${error.message}`);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return fail(502, "anthropic_unreachable", "Could not reach Anthropic. Check your connection and try again.");
    }
    if (error instanceof Anthropic.APIError) {
      return fail(502, "anthropic_error", `Anthropic returned an error (HTTP ${error.status ?? "unknown"}). Try again in a moment.`);
    }
    return fail(500, "coach_failed", "Coaching failed unexpectedly. Check the dev server log.");
  }
}
