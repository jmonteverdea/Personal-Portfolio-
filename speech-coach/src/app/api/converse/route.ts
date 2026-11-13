import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { parseModelJson } from "@/lib/coach/schema";
import { retryMessage } from "@/lib/coach/prompts";
import { conversationPrompt, ConverseRequestSchema, LINE_SYSTEM, LineSchema, REPLY_SYSTEM, ReplySchema, REWORD_SYSTEM, RewordSchema } from "@/lib/modes/converse";

/**
 * Conversation mode's server side: the partner's reply, a suggested line, and
 * a tighter rewording. Same pattern as /api/coach: the key stays here, every
 * reply is validated against a schema, retried once, then reported as an error.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "claude-sonnet-5-5";

function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

class ModelOutputError extends Error {}

async function ask<T>(client: Anthropic, model: string, system: string, user: string, schema: z.ZodType<T>, maxTokens: number): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\n${retryMessage(lastError)}` }],
      output_config: { format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === "refusal") throw new ModelOutputError("Claude declined this request. Try a different scenario or wording.");
    const raw = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    if (response.stop_reason === "max_tokens") {
      lastError = "The reply was cut off. Be shorter.";
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
    return fail(503, "anthropic_not_configured", "ANTHROPIC_API_KEY is not set. Conversation mode falls back to a scripted partner, and rewording to fixed rules.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "The request body is not valid JSON.");
  }
  const input = ConverseRequestSchema.safeParse(body);
  if (!input.success) {
    const issue = input.error.issues[0];
    return fail(400, "bad_request", `Invalid request: ${issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "unknown shape"}.`);
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  try {
    const req = input.data;
    if (req.task === "reply") return NextResponse.json({ data: await ask(client, model, REPLY_SYSTEM, conversationPrompt(req.scenario, req.turns), ReplySchema, 2000) });
    if (req.task === "line") return NextResponse.json({ data: await ask(client, model, LINE_SYSTEM, conversationPrompt(req.scenario, req.turns), LineSchema, 2000) });
    const prompt = `${req.question ? `They were asked: ${req.question}\n\n` : ""}Their answer, as spoken:\n${req.answer}`;
    return NextResponse.json({ data: await ask(client, model, REWORD_SYSTEM, prompt, RewordSchema, 4000) });
  } catch (error) {
    if (error instanceof ModelOutputError) return fail(502, "invalid_model_output", error.message);
    if (error instanceof Anthropic.AuthenticationError) return fail(502, "anthropic_key_rejected", "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.");
    if (error instanceof Anthropic.NotFoundError) return fail(502, "anthropic_model_not_found", `The model "${model}" was not found. Check ANTHROPIC_MODEL.`);
    if (error instanceof Anthropic.RateLimitError) return fail(429, "anthropic_rate_limited", "Anthropic is rate limiting this key. Wait a moment and try again.");
    if (error instanceof Anthropic.BadRequestError) return fail(502, "anthropic_bad_request", `Anthropic rejected the request for model "${model}": ${error.message}`);
    if (error instanceof Anthropic.APIConnectionError) return fail(502, "anthropic_unreachable", "Could not reach Anthropic. Check your connection and try again.");
    if (error instanceof Anthropic.APIError) return fail(502, "anthropic_error", `Anthropic returned an error (HTTP ${error.status ?? "unknown"}). Try again in a moment.`);
    return fail(500, "converse_failed", "The conversation request failed unexpectedly. Check the dev server log.");
  }
}
