import { buildAssessmentResult, parseAzureSegment } from "../azure/normalize";
import type { Coaching } from "../coach/schema";
import { summarizeSession } from "../history";
import type { AssessmentResult, PhonemeStat, Script, Segment, SessionRecord } from "../types";
import rawSegments from "./azure-segments.json";

/**
 * Demo mode data. The result is not hand-typed: it is the Azure-shaped fixture
 * run through the same normalizer the live path uses.
 */

export const DEMO_SCRIPT: Script = {
  id: "demo-script",
  title: "Weekly update: vendor review (sample)",
  text: "Good morning, everyone. I want to give a very quick update on the vendor review. We shipped the beta this week, and the feedback is positive overall. I think we need three more weeks to finish testing, so I would like to move the launch date.",
  tags: ["meeting"],
  createdAt: "2026-11-02T09:00:00.000Z",
  updatedAt: "2026-11-02T09:00:00.000Z",
};

export const DEMO_RESULT_ID = "demo-session-4";

export function demoSegments(): Segment[] {
  return (rawSegments as unknown[]).flatMap((raw) => {
    const segment = parseAzureSegment(raw);
    return segment ? [segment] : [];
  });
}

export function buildDemoResult(): AssessmentResult {
  return buildAssessmentResult(
    demoSegments(),
    {
      id: DEMO_RESULT_ID,
      createdAt: "2026-11-09T15:30:00.000Z",
      scriptId: DEMO_SCRIPT.id,
      scriptTitle: DEMO_SCRIPT.title,
      referenceText: DEMO_SCRIPT.text,
    },
    "demo",
  );
}

/** The sample take plus three earlier, weaker takes so the trend chart has a line to draw. */
export function buildDemoSessions(): SessionRecord[] {
  const latest = summarizeSession(buildDemoResult());
  const earlier = [
    { id: "demo-session-1", date: "2026-11-03T15:30:00.000Z", drop: 11, wpm: 171, pauses: 5 },
    { id: "demo-session-2", date: "2026-11-05T15:30:00.000Z", drop: 7, wpm: 164, pauses: 4 },
    { id: "demo-session-3", date: "2026-11-07T15:30:00.000Z", drop: 3, wpm: 158, pauses: 4 },
  ].map(({ id, date, drop, wpm, pauses }): SessionRecord => {
    const lower = (n: number): number => Math.max(0, Math.round((n - drop) * 10) / 10);
    const phonemeStats: Record<string, PhonemeStat> = {};
    for (const [phoneme, stat] of Object.entries(latest.phonemeStats)) {
      phonemeStats[phoneme] = { ...stat, sum: Math.max(0, stat.sum - drop * stat.count) };
    }
    return {
      ...latest,
      id,
      date,
      scores: latest.scores && {
        overall: lower(latest.scores.overall),
        accuracy: lower(latest.scores.accuracy),
        fluency: lower(latest.scores.fluency),
        completeness: latest.scores.completeness,
        prosody: latest.scores.prosody === null ? null : lower(latest.scores.prosody),
      },
      wordsPerMinute: wpm,
      longPauseCount: pauses,
      phonemeStats,
    };
  });
  return [...earlier, latest];
}

/** Coaching written for the sample take, in the exact shape /api/coach returns. */
export const DEMO_COACHING: Coaching = {
  priorities: [
    {
      title: "Turn /b/ back into /v/",
      detail:
        "\"very\", \"vendor\" and \"review\" all came out with a /b/. In one sentence that gives \"a berry quick update on the bendor rebiew\", which is the single most noticeable accent marker in this take. It is also your weakest sound across earlier sessions.",
    },
    {
      title: "Put the tongue between the teeth for \"th\"",
      detail:
        "\"think\" and \"three\" started with /t/ (\"tink\", \"tree\") and \"this\" and \"the\" started with /d/. \"Three more weeks\" is the key number in your update, and \"tree more weeks\" makes the listener work for it.",
    },
    {
      title: "Stop the mid-sentence stall before the number",
      detail:
        "You paused 1.3 seconds between \"need\" and \"three\", then repeated \"to\". The hesitation lands exactly on the ask, so it sounds unsure. Pause before \"I think\" instead and say \"we need three more weeks\" in one breath.",
    },
  ],
  soundFixes: [
    {
      sound: "/v/",
      exampleWords: ["very", "vendor", "review", "give", "move"],
      instruction:
        "Rest your top teeth lightly on the inside of your bottom lip and keep the lips apart. Push air through that gap while your voice buzzes: you should feel the lip vibrate. In Spanish, b and v are the same sound and the lips close. For English /v/ the lips never touch. At the end of \"give\" and \"move\", keep the buzz going to the end instead of letting it fade to /f/.",
      minimalPair: { target: "very", contrast: "berry" },
      drill: "berry, very. ban, van. best, vest. Then: a very quick vendor review.",
    },
    {
      sound: "/θ/",
      exampleWords: ["think", "three"],
      instruction:
        "Put the tip of your tongue lightly between your front teeth so you can feel air leak over it, and blow without voice. Do not let the tongue tap the ridge behind the teeth: that tap is what turns \"three\" into \"tree\". Hold the air for a beat before the vowel.",
      minimalPair: { target: "three", contrast: "tree" },
      drill: "tree, three. tank, thank. tin, thin. Then: I think we need three more weeks.",
    },
    {
      sound: "/ð/",
      exampleWords: ["this", "the"],
      instruction:
        "Same tongue position as /θ/, tip between the teeth, but switch your voice on so the tongue buzzes. Keep it a soft, continuous sound. If the tongue stops the air completely you get /d/ and \"this\" becomes \"dis\".",
      minimalPair: { target: "they", contrast: "day" },
      drill: "day, they. dough, though. Then: the beta this week.",
    },
    {
      sound: "/ɪ/",
      exampleWords: ["shipped", "this", "finish", "give"],
      instruction:
        "This is the short, relaxed vowel. Drop the jaw slightly and let the tongue go slack: no smile. You are using the Spanish i, which is the long tense vowel of \"sheep\", so \"shipped\" came out close to \"sheeped\". Keep it short and lazy.",
      minimalPair: { target: "ship", contrast: "sheep" },
      drill: "sheep, ship. leave, live. feel, fill. Then: we shipped it this week.",
    },
    {
      sound: "final /t/ and /d/",
      exampleWords: ["shipped", "date", "would"],
      instruction:
        "Finish the word. For \"shipped\", close the lips for /p/ and then tap the tongue tip behind the top teeth for a clear /t/: \"shipt\". \"date\" and \"would\" lost their last consonant, so \"launch date\" sounded like \"launch day\". Touch the tongue to the ridge and release a small puff of air.",
      minimalPair: { target: "date", contrast: "day" },
      drill: "day, date. ship, shipped. wood, would like. Then: move the launch date.",
    },
  ],
  pacingNotes: [
    {
      sentence: "I think we need three more weeks to finish testing, so I would like to move the launch date.",
      note: "A 1.3 second pause between \"need\" and \"three\", then \"to to finish\". Plan the breath: pause after \"testing\" at the comma, nowhere else in the first half.",
    },
    {
      sentence: "We shipped the beta this week, and the feedback is positive overall.",
      note: "You said \"the the feedback\" and dropped \"overall\". You were rushing into the second half. Take a full beat at the comma after \"week\", then finish the sentence, including the last word.",
    },
    {
      sentence: "Good morning, everyone. I want to give a very quick update on the vendor review.",
      note: "About 138 words per minute across the take, which is a good speed for a meeting update. Keep it. The pause after \"everyone\" worked.",
    },
  ],
  intonationNotes: [
    {
      sentence: "We shipped the beta this week, and the feedback is positive overall.",
      note: "This sentence was flagged as monotone, and it is your good news. Stress SHIPPED and POSitive, lift the pitch on \"week\" before the comma, and let it fall on \"overall\".",
    },
    {
      sentence: "I think we need three more weeks to finish testing, so I would like to move the launch date.",
      note: "Stress THREE and LAUNCH DATE, and let the pitch fall at the end. A falling finish makes the request sound decided, not tentative.",
    },
  ],
  rewordings: [
    {
      original: "I would like to move the launch date.",
      suggestion: "I recommend we move the launch date.",
      reason: "\"would like\" has two sounds you are still working on, the short vowel and the final /d/, and it sounds like a personal wish. \"I recommend\" is easier for you to say and firmer.",
    },
    {
      original: "I want to give a very quick update on the vendor review.",
      suggestion: "Here is a quick update on the vendor review.",
      reason: "Cuts \"give a very\", three /v/ and short-vowel traps in a row, without losing anything.",
    },
  ],
};
