import { z } from "zod";

/** Shapes exchanged with /api/coach, and the validation of what Claude returns. */

const text = z.string().trim().min(1);

export const CoachingSchema = z.object({
  priorities: z
    .array(z.object({ title: text, detail: text }))
    .min(1)
    .max(3)
    .describe("The top priorities to fix, most important first. At most 3."),
  soundFixes: z
    .array(
      z.object({
        sound: text.describe("The target sound in IPA, for example /v/"),
        exampleWords: z.array(text).min(1).describe("Words from the speaker's script where this sound went wrong"),
        instruction: text.describe("Plain-language tongue, lip, jaw and airflow instruction"),
        minimalPair: z.object({ target: text, contrast: text }).describe("One minimal pair, for example very / berry"),
        drill: text.describe("A short drill sentence or sequence using the minimal pair"),
      }),
    )
    .describe("One entry per problem sound found in this recording. Empty if there is no phoneme data."),
  pacingNotes: z
    .array(z.object({ sentence: text.describe("The exact sentence from the script"), note: text }))
    .describe("Pacing and pause notes tied to specific sentences"),
  intonationNotes: z
    .array(z.object({ sentence: text.describe("The exact sentence from the script"), note: text }))
    .describe("Stress and intonation notes tied to specific sentences"),
  rewordings: z
    .array(z.object({ original: text, suggestion: text, reason: text }))
    .describe("Optional. Phrases that are hard to say or sound unprofessional, with a better wording."),
});
export type Coaching = z.infer<typeof CoachingSchema>;

export const ScenarioSchema = z.object({
  title: text.describe("Short title, under 8 words"),
  tag: z.enum(["meeting", "presentation", "difficult conversation", "Slack reply"]),
  script: text.describe("What the speaker says, as plain sentences. 60 to 140 words. No stage directions."),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const DrillSchema = z.object({
  title: text,
  script: text.describe("A practice script of 40 to 80 words loaded with the target sound"),
});
export type Drill = z.infer<typeof DrillSchema>;

/* ---------- request ---------- */

const score = z.number().min(0).max(100);

export const CoachSummarySchema = z.object({
  source: z.enum(["azure", "transcript", "demo"]),
  sentences: z.array(z.object({ n: z.number().int(), text: z.string().max(1200), accuracy: score.nullable() })).min(1).max(200),
  scores: z
    .object({ overall: score, accuracy: score, fluency: score, completeness: score, prosody: score.nullable() })
    .nullable(),
  lowWords: z
    .array(
      z.object({
        word: z.string().max(60),
        sentence: z.number().int(),
        score,
        phonemes: z.array(z.object({ expected: z.string().max(8), score, heard: z.string().max(8).nullable() })).max(12),
      }),
    )
    .max(12),
  weakPhonemes: z
    .array(
      z.object({
        sound: z.string().max(8),
        average: score,
        count: z.number().int(),
        heardAs: z.string().max(8).nullable(),
        words: z.array(z.string().max(60)).max(5),
      }),
    )
    .max(10),
  miscues: z.object({
    omitted: z.array(z.object({ word: z.string().max(60), sentence: z.number().int() })).max(40),
    inserted: z.array(z.object({ word: z.string().max(60), after: z.string().max(60).nullable(), before: z.string().max(60).nullable() })).max(40),
    substituted: z.array(z.object({ expected: z.string().max(60), said: z.string().max(60) })).max(40),
  }),
  pacing: z.object({
    wordsPerMinute: z.number().nullable(),
    estimated: z.boolean(),
    longPauses: z
      .array(
        z.object({
          ms: z.number(),
          after: z.string().max(60),
          before: z.string().max(60),
          sentence: z.number().int().nullable(),
          midSentence: z.boolean(),
        }),
      )
      .max(30)
      .nullable(),
  }),
  intonation: z.object({
    monotoneSentences: z.array(z.number().int()).max(200),
    unexpectedBreaksBefore: z.array(z.string().max(60)).max(30),
    missingBreaksBefore: z.array(z.string().max(60)).max(30),
  }),
  recurringWeakSounds: z
    .array(z.object({ sound: z.string().max(8), average: score, sessions: z.number().int(), examples: z.array(z.string().max(60)).max(4) }))
    .max(8),
});
export type CoachSummary = z.infer<typeof CoachSummarySchema>;

export const CoachRequestSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("coach"),
    summary: CoachSummarySchema,
    /** Optional. Notes the speaker marked as not useful, so the coach stops repeating them. */
    avoid: z.array(z.string().max(240)).max(8).optional(),
  }),
  z.object({ task: z.literal("scenario"), prompt: z.string().trim().min(3).max(600) }),
  z.object({
    task: z.literal("drill"),
    phoneme: z.string().trim().min(1).max(8),
    examples: z.array(z.string().max(60)).max(6).default([]),
  }),
]);
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

/* ---------- response validation ---------- */

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Pull the JSON object out of a model reply, tolerating code fences or stray prose. */
export function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Validate a model reply against a schema. Never throws. */
export function parseModelJson<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  const json = extractJson(raw);
  if (json === null) return { ok: false, error: "The reply contained no JSON object." };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `The reply was not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `The JSON did not match the schema. ${issues}` };
  }
  return { ok: true, data: parsed.data };
}

export function parseCoaching(raw: string): ParseResult<Coaching> {
  return parseModelJson(raw, CoachingSchema);
}
