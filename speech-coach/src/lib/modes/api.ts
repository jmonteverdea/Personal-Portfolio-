import type { z } from "zod";
import { readError } from "../api";
import { AppError } from "../errors";
import { LineSchema, ReplySchema, RewordSchema, type ConverseRequest } from "./converse";

/** Browser-side calls to /api/converse. */
async function post<T>(request: ConverseRequest, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/converse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  } catch {
    throw new AppError("network", "Could not reach the app server. Is the dev server still running?");
  }
  if (!response.ok) {
    const { code, message } = await readError(response);
    throw new AppError(code === "anthropic_not_configured" ? "not_configured" : "service", message);
  }
  const body = (await response.json()) as { data?: unknown };
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) throw new AppError("service", "The server sent a reply in an unexpected shape.");
  return parsed.data;
}

type Turns = { role: "partner" | "me"; text: string }[];
type Scene = { title: string; setup: string };

export const converse = {
  reply: (scenario: Scene, turns: Turns) => post({ task: "reply", scenario, turns }, ReplySchema),
  line: (scenario: Scene, turns: Turns) => post({ task: "line", scenario, turns }, LineSchema),
  reword: (answer: string, question?: string) => post({ task: "reword", answer, question }, RewordSchema),
};
