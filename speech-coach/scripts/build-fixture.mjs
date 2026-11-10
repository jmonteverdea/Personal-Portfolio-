// Generates src/lib/fixtures/azure-segments.json: three raw Azure Speech
// pronunciation-assessment payloads (continuous mode, HundredMark, Phoneme, IPA,
// prosody on) for one take by a Spanish-speaking reader. The JSON shape follows
// the Azure docs. Used by the unit tests and by Demo mode. Run: npm run fixture
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const TICKS = 10_000;

// Deterministic pseudo-random numbers so the fixture never changes between runs.
let seed = 20261110;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));
const FILLER = ["ə", "t", "d", "ɪ", "n", "s", "k", "ɛ", "l", "m"];

// word | IPA phonemes | { phonemeIndex: [score, whatWasSaid] } | pauseBeforeMs
const SEGMENTS = [
  {
    display: "Good morning, everyone. I want to give a very quick update on the vendor review.",
    fluency: 88, prosody: 79, monotone: false,
    words: [
      ["good", "ɡ ʊ d"], ["morning", "m ɔ r n ɪ ŋ"], ["everyone", "ɛ v r i w ʌ n", { 1: [64, "b"] }],
      ["i", "aɪ", {}, 460], ["want", "w ɑ n t", { 3: [61, "n"] }], ["to", "t u"],
      ["give", "ɡ ɪ v", { 1: [58, "i"], 2: [52, "f"] }], ["a", "ə"],
      ["very", "v ɛ r i", { 0: [24, "b"] }], ["quick", "k w ɪ k", { 2: [63, "i"] }],
      ["update", "ʌ p d eɪ t"], ["on", "ɑ n"], ["the", "ð ə", { 0: [66, "d"] }],
      ["vendor", "v ɛ n d ɚ", { 0: [31, "b"] }], ["review", "r ɪ v j u", { 2: [55, "b"] }],
    ],
  },
  {
    display: "We shipped the beta this week and the the feedback is positive.",
    fluency: 81, prosody: 62, monotone: true, gapBeforeMs: 920,
    words: [
      ["we", "w i"], ["shipped", "ʃ ɪ p t", { 1: [38, "i"], 3: [29, "p"] }], ["the", "ð ə", { 0: [57, "d"] }],
      ["beta", "b eɪ t ə"], ["this", "ð ɪ s", { 0: [36, "d"], 1: [51, "i"] }], ["week", "w i k"],
      ["and", "æ n d", { 2: [59, "n"] }, 310], ["the", "ð ə", { 0: [62, "d"] }], ["the", "ð ə", { 0: [60, "d"] }, 380],
      ["feedback", "f i d b æ k", { 5: [47, "æ"] }], ["is", "ɪ z", { 1: [58, "s"] }],
      ["positive", "p ɑ z ə t ɪ v", { 2: [61, "s"], 6: [56, "f"] }],
    ],
  },
  {
    display: "I think we need three more weeks to to finish testing, so I would like to move the launch date.",
    fluency: 74, prosody: 71, monotone: false, gapBeforeMs: 540,
    words: [
      ["i", "aɪ"], ["think", "θ ɪ ŋ k", { 0: [27, "t"], 1: [60, "i"] }], ["we", "w i"], ["need", "n i d"],
      ["three", "θ r i", { 0: [33, "t"] }, 1250], ["more", "m ɔ r"], ["weeks", "w i k s"],
      ["to", "t u"], ["to", "t u", {}, 420], ["finish", "f ɪ n ɪ ʃ", { 1: [57, "i"], 4: [64, "s"] }],
      ["testing", "t ɛ s t ɪ ŋ"], ["so", "s oʊ", {}, 350], ["i", "aɪ"],
      ["would", "w ʊ d", { 1: [63, "u"], 2: [44, "t"] }], ["like", "l aɪ k"], ["to", "t u"],
      ["move", "m u v", { 2: [54, "f"] }], ["the", "ð ə", { 0: [65, "d"] }],
      ["launch", "l ɔ n tʃ", { 1: [68, "aʊ"] }], ["date", "d eɪ t", { 2: [46, "eɪ"] }],
    ],
  },
];

function nbest(expected, score, said) {
  const list = said
    ? [{ Phoneme: said, Score: between(84, 97) }, { Phoneme: expected, Score: score }]
    : [{ Phoneme: expected, Score: 100 }];
  for (const f of FILLER) {
    if (list.length >= 5) break;
    if (list.some((e) => e.Phoneme === f)) continue;
    list.push({ Phoneme: f, Score: between(2, Math.max(4, Math.min(30, score - 10))) });
  }
  return list.sort((a, b) => b.Score - a.Score);
}

function pronScore(parts) {
  const s = [...parts].sort((a, b) => a - b);
  return 0.4 * s[0] + 0.2 * (s[1] + s[2] + s[3]);
}

let cursorMs = 620; // leading silence before the first word
const out = SEGMENTS.map((seg, segIndex) => {
  cursorMs += seg.gapBeforeMs ?? 0;
  const segStart = cursorMs;
  const words = seg.words.map(([word, ipa, overrides = {}, pauseBefore = 0], wordIndex) => {
    const gap = wordIndex === 0 ? 0 : pauseBefore || between(35, 95);
    cursorMs += gap;
    const wordStart = cursorMs;
    const phonemes = ipa.split(" ").map((phoneme, i) => {
      const [score, said] = overrides[i] ?? [between(88, 100), null];
      const duration = between(55, 115);
      const entry = {
        Phoneme: phoneme,
        PronunciationAssessment: { AccuracyScore: score, NBestPhonemes: nbest(phoneme, score, said) },
        Offset: cursorMs * TICKS,
        Duration: duration * TICKS,
      };
      cursorMs += duration;
      return entry;
    });
    // Azure's word score is not a plain mean: one badly missed sound drags the word down.
    const scores = phonemes.map((p) => p.PronunciationAssessment.AccuracyScore);
    const mean = scores.reduce((sum, v) => sum + v, 0) / scores.length;
    const accuracy = Math.round(0.5 * mean + 0.5 * Math.min(...scores));
    const unexpected = wordIndex > 0 && gap >= 700;
    return {
      Word: word,
      Offset: wordStart * TICKS,
      Duration: (cursorMs - wordStart) * TICKS,
      PronunciationAssessment: {
        AccuracyScore: accuracy,
        ErrorType: accuracy < 60 ? "Mispronunciation" : "None",
        Feedback: {
          Prosody: {
            Break: {
              ErrorTypes: [unexpected ? "UnexpectedBreak" : "None"],
              UnexpectedBreak: { Confidence: unexpected ? 0.93 : Number((rand() * 0.2).toFixed(3)) },
              MissingBreak: { Confidence: Number((rand() * 0.15).toFixed(3)) },
              BreakLength: gap * TICKS,
            },
            Intonation: {
              ErrorTypes: seg.monotone ? ["Monotone"] : [],
              Monotone: { SyllablePitchDeltaConfidence: seg.monotone ? 0.86 : Number((0.2 + rand() * 0.2).toFixed(3)) },
            },
          },
        },
      },
      Syllables: [
        {
          Syllable: ipa.replaceAll(" ", ""),
          PronunciationAssessment: { AccuracyScore: accuracy },
          Offset: wordStart * TICKS,
          Duration: (cursorMs - wordStart) * TICKS,
        },
      ],
      Phonemes: phonemes,
    };
  });

  const accuracy = Math.round(
    words.reduce((sum, w) => sum + w.PronunciationAssessment.AccuracyScore, 0) / words.length,
  );
  const lexical = words.map((w) => w.Word).join(" ");
  return {
    Id: `demo${String(segIndex + 1).padStart(2, "0")}a7c2e94b5d0f8136`,
    RecognitionStatus: "Success",
    Offset: segStart * TICKS,
    Duration: (cursorMs - segStart) * TICKS,
    Channel: 0,
    DisplayText: seg.display,
    SNR: 31.4,
    NBest: [
      {
        Confidence: Number((0.9 + rand() * 0.08).toFixed(6)),
        Lexical: lexical,
        ITN: lexical,
        MaskedITN: lexical,
        Display: seg.display,
        PronunciationAssessment: {
          AccuracyScore: accuracy,
          FluencyScore: seg.fluency,
          ProsodyScore: seg.prosody,
          CompletenessScore: 100,
          PronScore: Number(pronScore([accuracy, seg.fluency, seg.prosody, 100]).toFixed(1)),
        },
        Words: words,
      },
    ],
  };
});

const target = path.join(here, "../src/lib/fixtures/azure-segments.json");
writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${out.length} segments, ${out.reduce((n, s) => n + s.NBest[0].Words.length, 0)} words to ${target}`);
