import type { Coaching, CoachSummary } from "./schema";

/**
 * The built-in coach. No AI, no key, no cost: it turns the same summary Claude
 * would get into coaching, using a fixed guide to English sounds written for a
 * Spanish speaker. Pure and deterministic. It cannot suggest rewordings.
 */

interface SoundGuide {
  /** What the tongue, lips, jaw and air do. */
  how: string;
  /** Default minimal pair: [target word, contrast word]. */
  pair: [string, string];
  /** Minimal pairs for a specific sound heard instead. */
  pairs?: Record<string, [string, string]>;
  /** What went wrong when a specific sound was heard instead. */
  habits?: Record<string, string>;
}

const GUIDE: Record<string, SoundGuide> = {
  v: {
    how: "Rest your top teeth lightly on the inside of your bottom lip and keep the lips apart. Push air through that gap with your voice on, so the lip buzzes.",
    pair: ["very", "berry"],
    pairs: { b: ["very", "berry"], f: ["save", "safe"] },
    habits: {
      b: "Your lips closed, which is the Spanish b/v. For English /v/ the lips never touch.",
      f: "Your voice switched off, so it came out as /f/. Keep the buzz going to the end of the word.",
    },
  },
  b: { how: "Close both lips fully, build a little pressure, then release with your voice on.", pair: ["best", "vest"], habits: { v: "The lips stayed open. Close them completely." } },
  θ: {
    how: "Put the tip of your tongue lightly between your front teeth and blow air over it, with no voice.",
    pair: ["three", "tree"],
    pairs: { t: ["three", "tree"], s: ["think", "sink"], f: ["three", "free"], d: ["thin", "din"] },
    habits: {
      t: "Your tongue tapped the ridge behind the teeth, which makes /t/. Keep it between the teeth and let the air flow.",
      s: "Your tongue stayed behind the teeth, which makes /s/. Bring the tip forward until it shows.",
      f: "You used lip and teeth, which makes /f/. Use the tongue tip instead.",
    },
  },
  ð: {
    how: "Put the tip of your tongue lightly between your front teeth and turn your voice on, so the tongue buzzes. Keep it soft and continuous.",
    pair: ["they", "day"],
    pairs: { d: ["they", "day"], z: ["then", "zen"] },
    habits: { d: "Your tongue stopped the air completely, which makes /d/. Let the air keep flowing past the tongue." },
  },
  z: {
    how: "Make an /s/, then turn your voice on. Put a hand on your throat: you should feel it vibrate.",
    pair: ["zoo", "sue"],
    pairs: { s: ["prize", "price"] },
    habits: { s: "Your voice was off, so it came out as /s/. Spanish has no /z/. Keep the buzz on, especially in is, was, these and plural endings." },
  },
  s: { how: "Tongue tip close to the ridge behind the top teeth, air hissing through, voice off. Do not add a vowel before it at the start of a word.", pair: ["sue", "zoo"] },
  ʃ: {
    how: "Round your lips slightly, pull the tongue back from the /s/ position and let the air flow without stopping.",
    pair: ["ship", "chip"],
    pairs: { tʃ: ["share", "chair"], s: ["she", "see"] },
    habits: { tʃ: "Your tongue touched the roof of the mouth first, which makes ch. Keep the air flowing from the start.", s: "Your tongue was too far forward. Pull it back and round the lips." },
  },
  tʃ: {
    how: "Start with the tongue pressed behind the top teeth as for /t/, then release into sh in one quick move.",
    pair: ["chair", "share"],
    pairs: { ʃ: ["watch", "wash"] },
    habits: { ʃ: "You skipped the stop at the start. Block the air first, then release." },
  },
  dʒ: {
    how: "Start with the tongue pressed behind the top teeth as for /d/, then release with your voice on and lips slightly rounded.",
    pair: ["jet", "yet"],
    pairs: { j: ["jet", "yet"], tʃ: ["badge", "batch"], ʒ: ["major", "measure"] },
    habits: { j: "The tongue never touched, so it came out as y. Block the air first.", tʃ: "Your voice was off. Keep it on." },
  },
  ʒ: { how: "Make sh, then turn your voice on. Lips slightly rounded, air flowing.", pair: ["measure", "mesher"] },
  j: {
    how: "Tongue high and forward, close to the roof of the mouth but not touching, then glide into the vowel.",
    pair: ["yet", "jet"],
    habits: { dʒ: "Your tongue touched the roof of the mouth, which makes j. Keep a small gap." },
  },
  h: { how: "Just breathe out, mouth open, with no friction in the throat. It is much softer than the Spanish j.", pair: ["hold", "old"] },
  r: { how: "Curl the tongue tip up and back without touching anything, and round the lips a little. No tap and no trill.", pair: ["right", "light"] },
  l: { how: "Press the tongue tip on the ridge behind the top teeth and let the air pass around the sides. At the end of a word, hold it there.", pair: ["light", "right"] },
  ŋ: {
    how: "Raise the back of the tongue to the soft palate and send the air through the nose. The tongue tip stays down, and there is no /g/ at the end.",
    pair: ["thing", "thin"],
    habits: { n: "Your tongue tip went up, which makes /n/. Keep the tip down and use the back of the tongue." },
  },
  n: { how: "Tongue tip on the ridge behind the top teeth, air through the nose. Hold it clearly at the end of words.", pair: ["sun", "sung"] },
  m: { how: "Close both lips and send the air through the nose. At the end of a word, close the lips fully: do not let it turn into /n/.", pair: ["some", "sun"] },
  t: {
    how: "Tap the tongue tip on the ridge behind the top teeth, not on the teeth, and release a small puff of air. At the end of a word, finish it: touch and release.",
    pair: ["date", "day"],
    pairs: { d: ["write", "ride"] },
    habits: { d: "It was voiced like /d/. Add the puff of air and keep the voice off." },
  },
  d: {
    how: "Tongue tip on the ridge behind the top teeth, voice on. At the end of a word, finish it with a clear touch instead of letting it fade.",
    pair: ["need", "knee"],
    pairs: { t: ["ride", "write"], ð: ["day", "they"] },
    habits: { t: "Your voice switched off, so it came out as /t/. Keep the vowel before it long and the voice on.", ð: "The tongue was too soft and far forward. Make a firm, complete stop." },
  },
  k: { how: "Lift the back of the tongue to the soft palate, stop the air, then release with a puff. At the end of a word, do not swallow it.", pair: ["back", "bag"] },
  ɡ: { how: "Lift the back of the tongue to the soft palate, stop the air fully, then release with your voice on.", pair: ["bag", "back"] },
  p: { how: "Close both lips, build pressure, release with a clear puff of air and no voice.", pair: ["pack", "back"] },
  f: { how: "Top teeth on the bottom lip, air through the gap, voice off.", pair: ["safe", "save"] },
  w: { how: "Round the lips tightly as for oo, then open quickly into the vowel. Do not add a /g/ sound before it.", pair: ["wood", "good"] },
  ɪ: {
    how: "Short and relaxed. Drop the jaw slightly and let the tongue go slack. No smile.",
    pair: ["ship", "sheep"],
    habits: { i: "You used the Spanish i, which is the long tense vowel of sheep. Shorten it and relax." },
  },
  i: {
    how: "Long and tense. Spread the lips as in a smile, tongue high and forward, and hold it.",
    pair: ["sheep", "ship"],
    habits: { ɪ: "It was too short. Hold it longer and smile." },
  },
  ʊ: {
    how: "Short and relaxed, lips only slightly rounded, tongue a little lower than for oo.",
    pair: ["full", "fool"],
    habits: { u: "You used the Spanish u, which is the long vowel of food. Shorten it and relax the lips." },
  },
  u: { how: "Long and tense, lips tightly rounded and pushed forward. Hold it.", pair: ["fool", "full"] },
  æ: {
    how: "Open the jaw wide and spread the lips, tongue low and forward. It sits between the Spanish a and e.",
    pair: ["bad", "bed"],
    pairs: { ɛ: ["bad", "bed"], ɑ: ["hat", "hot"], ʌ: ["cap", "cup"] },
    habits: { ɛ: "The jaw was too closed. Open wider.", ɑ: "The tongue was too far back. Bring it forward and spread the lips." },
  },
  ʌ: {
    how: "Short and relaxed, jaw half open, tongue in the middle, lips neutral. Shorter and more central than the Spanish a.",
    pair: ["cup", "cop"],
    pairs: { ɑ: ["cup", "cop"], æ: ["cup", "cap"], ɔ: ["but", "bought"] },
  },
  ɑ: { how: "Open the jaw wide, tongue low and back, lips relaxed and not rounded.", pair: ["cop", "cup"] },
  ɔ: { how: "Jaw open, lips slightly rounded, tongue low and back. Keep it one steady sound.", pair: ["bought", "boat"] },
  ə: { how: "The weakest sound in English: very short, mouth barely open, tongue at rest. Say it quickly and without stress. Do not pronounce the written vowel.", pair: ["about", "a bout"] },
  ɛ: { how: "Jaw half open, lips relaxed, tongue in the middle front. Short.", pair: ["bed", "bad"] },
  ɝ: { how: "Hold the English r position, tongue curled back and lips slightly rounded, and voice it as a vowel. There is no separate vowel before the r.", pair: ["work", "walk"] },
  ɚ: { how: "A quick, unstressed r-colored sound: tongue curled back, very short. Do not say a full vowel plus a tapped r.", pair: ["better", "betta"] },
  eɪ: { how: "Start at e and glide up toward i. Two parts, one syllable. Do not cut the glide.", pair: ["late", "let"] },
  aɪ: { how: "Start with an open a and glide up toward i.", pair: ["time", "tam"] },
  oʊ: { how: "Start at o and close the lips toward u as you finish. The Spanish o is too short and flat.", pair: ["note", "not"] },
  aʊ: { how: "Start with an open a and round the lips toward u.", pair: ["now", "no"] },
  ɔɪ: { how: "Start with a rounded o and glide up toward i.", pair: ["boy", "buy"] },
};

const ALIASES: Record<string, string> = { ɹ: "r", g: "ɡ", ɜ: "ɝ", ɒ: "ɑ", a: "ɑ", e: "ɛ", o: "oʊ" };

const STOPWORDS = new Set(
  "a an the and or but so to of in on at for from with by as is are was were be been am i you he she it we they me my your our their this that these those do does did will would can could should have has had not no yes if then than there here what which who when where how all any some more most very just also about into over up out".split(" "),
);

const MAX_SOUND_FIXES = 5;

function guideFor(sound: string): SoundGuide | null {
  const key = sound.replace(/[/ːˈˌ\s]/g, "");
  return GUIDE[key] ?? GUIDE[ALIASES[key] ?? ""] ?? null;
}

function list(words: readonly string[], max = 4): string {
  const shown = words.slice(0, max).map((w) => `"${w}"`);
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} seconds`;
}

/** The words that carry the meaning: the longest non-function words in the sentence. */
function stressWords(sentence: string, max = 2): string[] {
  const words = sentence
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
  const picked = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, max);
  return words.filter((w, i) => picked.includes(w) && words.indexOf(w) === i);
}

interface Candidate {
  severity: number;
  title: string;
  detail: string;
}

export function buildLocalCoaching(summary: CoachSummary): Coaching {
  const sentenceText = (n: number | null): string | null => summary.sentences.find((s) => s.n === n)?.text ?? null;
  const recurring = new Map(summary.recurringWeakSounds.map((s) => [s.sound, s]));

  /* ----- sound fixes ----- */
  const soundFixes: Coaching["soundFixes"] = summary.weakPhonemes.slice(0, MAX_SOUND_FIXES).map((p) => {
    const guide = guideFor(p.sound);
    const heard = p.heardAs;
    const pair = (heard && guide?.pairs?.[heard]) || guide?.pair || null;
    const habit = heard ? guide?.habits?.[heard] ?? `It was heard as /${heard}/.` : null;
    const instruction = guide
      ? [guide.how, habit].filter(Boolean).join(" ")
      : `This sound averaged ${p.average}. Click each word above, play the reference, and copy it slowly, one sound at a time.${heard ? ` It was heard as /${heard}/.` : ""}`;
    const practice = p.words.slice(0, 3).join(", ");
    return {
      sound: `/${p.sound}/`,
      exampleWords: p.words.length > 0 ? p.words : [p.sound],
      instruction,
      minimalPair: pair ? { target: pair[0], contrast: pair[1] } : { target: p.words[0] ?? p.sound, contrast: "the reference recording" },
      drill: pair
        ? `Say "${pair[1]}, ${pair[0]}" five times and feel the difference. Then say your own words slowly: ${practice}.`
        : `Say each word slowly three times, then at normal speed: ${practice}.`,
    };
  });

  /* ----- priorities ----- */
  const candidates: Candidate[] = [];

  // At most two sound priorities, so pacing or accuracy problems can take the third slot.
  summary.weakPhonemes.slice(0, 2).forEach((p, rank) => {
    const history = recurring.get(p.sound);
    const again = history ? ` It was also weak in ${history.sessions} earlier ${history.sessions === 1 ? "session" : "sessions"}, so it is a habit, not a slip.` : "";
    candidates.push({
      severity: 100 - p.average + (history ? 15 : 0) - rank * 2,
      title: p.heardAs ? `Fix /${p.sound}/: you are saying /${p.heardAs}/` : `Fix the /${p.sound}/ sound`,
      detail: `It averaged ${p.average} out of 100 in ${list(p.words)}.${again}`,
    });
  });

  const midPauses = (summary.pacing.longPauses ?? []).filter((p) => p.midSentence);
  const worstPause = [...midPauses].sort((a, b) => b.ms - a.ms)[0];
  if (worstPause) {
    candidates.push({
      severity: 30 + Math.min(25, worstPause.ms / 80) + midPauses.length * 5,
      title: midPauses.length > 1 ? `Stop stalling mid-sentence (${midPauses.length} long pauses)` : "Stop the mid-sentence stall",
      detail: `You paused ${seconds(worstPause.ms)} between "${worstPause.after}" and "${worstPause.before}". A pause inside a phrase sounds unsure. Pause at commas and full stops instead, and say each phrase in one breath.`,
    });
  }

  const { omitted, inserted, substituted } = summary.miscues;
  const slips = omitted.length + inserted.length + substituted.length;
  if (slips >= 2) {
    const parts = [
      omitted.length ? `skipped ${list(omitted.map((o) => o.word), 3)}` : "",
      inserted.length ? `added ${list(inserted.map((i) => i.word), 3)}` : "",
      substituted.length ? `said ${list(substituted.map((s) => s.said), 2)} for ${list(substituted.map((s) => s.expected), 2)}` : "",
    ].filter(Boolean);
    candidates.push({
      severity: 25 + slips * 6,
      title: "Say every word of the script",
      detail: `You ${parts.join(", ")}. This usually means you are reading ahead of your mouth. Slow down slightly and finish each sentence before you start the next.`,
    });
  }

  const wpm = summary.pacing.wordsPerMinute;
  if (wpm !== null && !summary.pacing.estimated && wpm > 170) {
    candidates.push({ severity: 30 + (wpm - 170) / 2, title: `Slow down: ${wpm} words per minute`, detail: "That is fast for a non-native listener to follow, and speed makes final consonants disappear. Aim for 130 to 160 by adding a full beat at every comma and full stop." });
  } else if (wpm !== null && !summary.pacing.estimated && wpm < 110) {
    candidates.push({ severity: 25 + (110 - wpm) / 2, title: `Pick up the pace: ${wpm} words per minute`, detail: "That is slow enough to sound hesitant. Aim for 130 to 160 by linking the words inside each phrase and keeping pauses for punctuation." });
  }

  if (summary.intonation.monotoneSentences.length > 0) {
    candidates.push({
      severity: 28 + summary.intonation.monotoneSentences.length * 6,
      title: "Add pitch movement",
      detail: `${summary.intonation.monotoneSentences.length === 1 ? "One sentence was" : `${summary.intonation.monotoneSentences.length} sentences were`} flagged as flat. Spanish rhythm gives every syllable equal weight. English wants one or two stressed words per sentence, louder and higher, and a falling pitch at the end.`,
    });
  }

  const priorities = candidates
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map(({ title, detail }) => ({ title, detail }));
  if (priorities.length === 0) {
    priorities.push(
      summary.scores
        ? { title: "Clean take: raise the difficulty", detail: "No sound averaged under 80, with no mid-sentence stalls or skipped words. Practice a longer or harder script, or record this one faster." }
        : { title: "Clean read", detail: "You said every word of the script in order. This take has no sound-level scores, so there is nothing more specific to coach." },
    );
  }

  /* ----- pacing notes ----- */
  const pacingNotes: Coaching["pacingNotes"] = [];
  for (const pause of summary.pacing.longPauses ?? []) {
    const sentence = sentenceText(pause.sentence);
    if (!sentence || !pause.midSentence) continue;
    pacingNotes.push({ sentence, note: `A ${seconds(pause.ms)} pause between "${pause.after}" and "${pause.before}". Say "${pause.after} ${pause.before}" together, and move the breath to the nearest comma or full stop.` });
  }
  const bySentence = new Map<number, string[]>();
  for (const o of omitted) bySentence.set(o.sentence, [...(bySentence.get(o.sentence) ?? []), o.word]);
  for (const [n, words] of bySentence) {
    const sentence = sentenceText(n);
    if (sentence) pacingNotes.push({ sentence, note: `You skipped ${list(words)}. Finish the sentence, including its last word, before moving on.` });
  }
  const same = (a: string | null, b: string): boolean => a !== null && a.toLowerCase() === b.toLowerCase();
  const repeats = inserted.filter((i) => same(i.after, i.word) || same(i.before, i.word));
  const firstSentence = summary.sentences[0]?.text;
  if (repeats.length > 0 && firstSentence) {
    pacingNotes.push({ sentence: firstSentence, note: `Across the take you repeated ${list(repeats.map((r) => r.word))}. A repeat is a restart: when you feel one coming, pause silently instead.` });
  }
  if (wpm !== null && firstSentence) {
    const verdict = summary.pacing.estimated
      ? "This is an estimate from total recording time."
      : wpm > 170
        ? "Fast. Add a beat at each comma and full stop."
        : wpm < 110
          ? "Slow. Link the words inside each phrase."
          : "A good speed for work speech. Keep it.";
    pacingNotes.push({ sentence: firstSentence, note: `Overall pace: ${wpm} words per minute. ${verdict}` });
  }

  /* ----- intonation notes ----- */
  const intonationNotes: Coaching["intonationNotes"] = [];
  for (const n of summary.intonation.monotoneSentences) {
    const sentence = sentenceText(n);
    if (!sentence) continue;
    const stress = stressWords(sentence).map((w) => w.toUpperCase());
    const ending = sentence.trim().endsWith("?") ? "Let the pitch rise at the end if it is a yes or no question." : "Let the pitch fall on the last word so it sounds finished.";
    intonationNotes.push({ sentence, note: `Flagged as flat. ${stress.length ? `Stress ${stress.join(" and ")}: louder, longer and higher than the words around them. ` : ""}${ending}` });
  }
  if (summary.intonation.missingBreaksBefore.length > 0 && firstSentence) {
    intonationNotes.push({ sentence: firstSentence, note: `You ran through punctuation before ${list(summary.intonation.missingBreaksBefore)}. A short pause there helps the listener hear where one idea ends.` });
  }

  return { priorities, soundFixes, pacingNotes, intonationNotes, rewordings: [] };
}
