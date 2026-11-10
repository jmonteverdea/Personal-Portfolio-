import type { z } from "zod";
import { AppError } from "./errors";
import { CoachingSchema, DrillSchema, ScenarioSchema, type CoachRequest } from "./coach/schema";

/** Browser-side calls to the app's own API routes. */

async function readError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.message) return { code: body.error.code ?? "", message: body.error.message };
  } catch {
    // fall through
  }
  return { code: "", message: `The server returned HTTP ${response.status}.` };
}

async function postCoach<T>(request: CoachRequest, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new AppError("network", "Could not reach the app server. Is the dev server still running?");
  }
  if (!response.ok) {
    const { code, message } = await readError(response);
    throw new AppError(code === "anthropic_not_configured" ? "not_configured" : "service", message);
  }
  const body = (await response.json()) as { data?: unknown };
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) throw new AppError("service", "The server sent coaching in an unexpected shape.");
  return parsed.data;
}

export const api = {
  coach: (summary: Extract<CoachRequest, { task: "coach" }>["summary"]) =>
    postCoach({ task: "coach", summary }, CoachingSchema),
  scenario: (prompt: string) => postCoach({ task: "scenario", prompt }, ScenarioSchema),
  drill: (phoneme: string, examples: string[]) => postCoach({ task: "drill", phoneme, examples }, DrillSchema),
};

export { readError };
