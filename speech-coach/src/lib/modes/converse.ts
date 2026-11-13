import { z } from "zod";

/** Shapes exchanged with /api/converse: the conversation partner, the suggested line, the tighter rewording. */

const text = z.string().trim().min(1);
const turn = z.object({ role: z.enum(["partner", "me"]), text: z.string().max(1200) });
const scenario = z.object({ title: z.string().max(120), setup: z.string().max(600) });

export const ConverseRequestSchema = z.discriminatedUnion("task", [
  z.object({ task: z.literal("reply"), scenario, turns: z.array(turn).max(24) }),
  z.object({ task: z.literal("line"), scenario, turns: z.array(turn).max(24) }),
  z.object({ task: z.literal("reword"), answer: z.string().trim().min(8).max(1500), question: z.string().max(600).optional() }),
]);
export type ConverseRequest = z.infer<typeof ConverseRequestSchema>;

export const ReplySchema = z.object({
  reply: text.describe("What the partner says next. One or two short spoken sentences, ending in one question unless closing."),
  done: z.boolean().describe("True when the conversation has reached a natural end and this reply closes it."),
});
export const LineSchema = z.object({ line: text.describe("One natural reply the speaker could say next, under 25 words.") });
export const RewordSchema = z.object({
  suggestion: text.describe("The same answer, tighter: same meaning and facts, plain spoken English, no fillers or hedges."),
  reason: text.describe("One sentence on what was tightened."),
});

const SPEAKER =
  "The speaker is a professional whose first language is Spanish and who works in English. The goal is to be clearly understood and confident in meetings. Never comment on their accent, and never suggest they should sound like a native speaker.";

export const REPLY_SYSTEM = `You are a role-play partner for spoken English practice at work. ${SPEAKER}

Stay in the role described in the scenario. This is a spoken conversation, so:
- Reply in one or two short sentences, the way a person talks. No lists, no markdown, no stage directions.
- Ask one thing at a time. React to what they actually said.
- Do not correct their English and do not coach. You are the other person in the room.
- After four or five exchanges, or when the matter is settled, close naturally and set done to true.
Reply with one JSON object matching the schema and nothing else.`;

export const LINE_SYSTEM = `You suggest what a speaker could say next in a workplace role-play. ${SPEAKER}

Give one reply they could say out loud right now: natural, direct, professional, under 25 words, first person. No hedging, no filler words. Write numbers as words. Reply with one JSON object matching the schema and nothing else.`;

export const REWORD_SYSTEM = `You tighten spoken answers. ${SPEAKER}

You get one answer the speaker gave out loud. Rewrite it so it says the same thing in fewer words: same facts and meaning, plain spoken English they could say in a meeting, short sentences, the main point first. Remove fillers, hedges and repetition. Do not add facts. Write numbers as words. No em dashes. Reply with one JSON object matching the schema and nothing else.`;

export function conversationPrompt(scenario: { title: string; setup: string }, turns: readonly { role: string; text: string }[]): string {
  const history = turns.map((t) => `${t.role === "me" ? "Speaker" : "You"}: ${t.text}`).join("\n");
  return `Scenario: ${scenario.title}\nYour role: ${scenario.setup}\n\nConversation so far:\n${history || "(not started)"}`;
}
