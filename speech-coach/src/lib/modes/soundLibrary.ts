/**
 * The sound library. One entry per English sound, written once and kept as
 * static data: nothing here is generated at runtime. Written for a Spanish
 * speaker, in plain language. The mouth diagrams drawn from `mouth` are
 * schematic: they show the idea of the position, not anatomy.
 *
 * Not reviewed by a speech-language professional. Treat it as a careful
 * learner's guide, and correct it here if a coach tells you otherwise.
 */

export type TonguePose =
  | "rest" | "teeth" | "ridge" | "ridge-near" | "post" | "palate" | "velum" | "curl"
  | "high-front" | "mid-front" | "low-front" | "mid" | "high-back" | "mid-back" | "low-back";
export type LipPose = "closed" | "teeth-lip" | "round" | "round-tight" | "spread" | "neutral" | "open";
export type Airflow = "stop" | "flow" | "nose" | "glide" | "open";

export interface MouthShape {
  tongue: TonguePose;
  lips: LipPose;
  voiced: boolean;
  air: Airflow;
  /** For diphthongs: the position the mouth moves to. */
  to?: { tongue: TonguePose; lips: LipPose };
}

export interface SoundEntry {
  /** A common word that carries the sound, with the letters that make it. */
  keyword: string;
  kind: "consonant" | "vowel" | "diphthong";
  tongue: string;
  lips: string;
  jaw: string;
  air: string;
  /** Which Spanish sound tends to replace it, and how the English one differs. Null when Spanish has the same sound. */
  trap: string | null;
  /** A short hint in Spanish. Shown only when the setting is on. */
  es: string;
  mouth: MouthShape;
}

const c = (keyword: string, tongue: string, lips: string, jaw: string, air: string, trap: string | null, es: string, mouth: MouthShape): SoundEntry => ({ keyword, kind: "consonant", tongue, lips, jaw, air, trap, es, mouth });
const v = (keyword: string, tongue: string, lips: string, jaw: string, air: string, trap: string | null, es: string, mouth: MouthShape, kind: "vowel" | "diphthong" = "vowel"): SoundEntry => ({ keyword, kind, tongue, lips, jaw, air, trap, es, mouth });

export const SOUND_LIBRARY: Record<string, SoundEntry> = {
  p: c("pen", "Resting. It does nothing for this sound.", "Pressed together, then released.", "Almost closed.", "Stopped behind the lips, then let out with a clear puff. No voice.", "Spanish p has no puff of air. In English, at the start of a stressed word, hold a hand in front of your mouth: you should feel it.", "Como la p española, pero con un soplo de aire al soltarla.", { tongue: "rest", lips: "closed", voiced: false, air: "stop" }),
  b: c("big", "Resting.", "Pressed fully together, then released.", "Almost closed.", "Stopped behind the lips, then released with the voice on.", "Between vowels, Spanish b goes soft and the lips do not quite close. In English the lips always close completely.", "Cierra los labios del todo, también entre vocales.", { tongue: "rest", lips: "closed", voiced: true, air: "stop" }),
  t: c("ten", "The tip taps the ridge just behind the top teeth, not the teeth themselves.", "Slightly open.", "Almost closed.", "Stopped by the tongue tip, then released with a small puff. No voice.", "Spanish t is made on the teeth and has no puff. At the end of a word it often disappears: in English, touch and release it.", "La punta de la lengua toca detrás de los dientes, no en ellos. Al final de la palabra, pronúnciala.", { tongue: "ridge", lips: "neutral", voiced: false, air: "stop" }),
  d: c("day", "The tip presses the ridge just behind the top teeth.", "Slightly open.", "Almost closed.", "Stopped by the tongue tip, then released with the voice on.", "Between vowels, Spanish d softens into the sound of English “the”. In English it stays a firm stop. At the end of a word, keep the voice on so it does not become /t/.", "Es un golpe firme, no la d suave de «nada». Al final, mantén la voz.", { tongue: "ridge", lips: "neutral", voiced: true, air: "stop" }),
  k: c("key", "The back rises and presses the soft palate.", "Neutral.", "Slightly open.", "Stopped at the back, then released with a puff. No voice.", "Spanish k has no puff, and at the end of a word it is often swallowed. Release it.", "Como la k española, con un soplo de aire. No te la comas al final.", { tongue: "velum", lips: "neutral", voiced: false, air: "stop" }),
  ɡ: c("go", "The back rises and presses the soft palate.", "Neutral.", "Slightly open.", "Stopped at the back, then released with the voice on.", "Between vowels, Spanish g goes soft and never fully closes. In English it is always a complete stop.", "Cierre completo siempre, no la g suave de «lago».", { tongue: "velum", lips: "neutral", voiced: true, air: "stop" }),
  f: c("five", "Resting.", "Top teeth rest on the bottom lip.", "Almost closed.", "Flows through the gap between teeth and lip. No voice.", null, "Igual que la f española.", { tongue: "rest", lips: "teeth-lip", voiced: false, air: "flow" }),
  v: c("very", "Resting.", "Top teeth rest lightly on the inside of the bottom lip. The lips stay apart.", "Almost closed.", "Flows through the gap with the voice on, so the lip buzzes.", "Spanish b and v are the same sound, made with both lips. English /v/ is made with teeth on lip, and the lips never touch each other.", "Dientes de arriba sobre el labio de abajo, con voz. Los labios nunca se tocan.", { tongue: "rest", lips: "teeth-lip", voiced: true, air: "flow" }),
  θ: c("think", "The tip rests lightly between the front teeth.", "Slightly open, relaxed.", "Slightly open.", "Flows over the tongue tip. No voice.", "Most Latin American Spanish has no such sound, so /t/ or /s/ takes its place. Let the tip show between the teeth and keep the air moving.", "La punta de la lengua entre los dientes, soplando, sin voz. Como la z de España.", { tongue: "teeth", lips: "neutral", voiced: false, air: "flow" }),
  ð: c("this", "The tip rests lightly between the front teeth.", "Slightly open, relaxed.", "Slightly open.", "Flows over the tongue tip with the voice on.", "This is close to the soft Spanish d in “nada”. At the start of a word Spanish uses a hard d instead, which gives “dis” for “this”. Keep it soft and continuous everywhere.", "Como la d suave de «nada», también al principio de la palabra.", { tongue: "teeth", lips: "neutral", voiced: true, air: "flow" }),
  s: c("see", "The tip comes close to the ridge behind the top teeth without touching.", "Slightly spread.", "Almost closed.", "Hisses through the narrow gap. No voice.", "The sound itself matches Spanish. The trap is adding an “e” before it at the start of a word: “estreet” for “street”. Start straight on the hiss.", "Empieza directamente con la s: «street», no «estreet».", { tongue: "ridge-near", lips: "spread", voiced: false, air: "flow" }),
  z: c("zoo", "The tip comes close to the ridge behind the top teeth without touching.", "Slightly spread.", "Almost closed.", "Hisses through the gap with the voice on. A hand on the throat feels it buzz.", "Spanish has no /z/, so it comes out as /s/. That matters in very common words: is, was, his, these, and most plurals.", "Una s con voz, como un zumbido. Fíjate en «is», «was» y los plurales.", { tongue: "ridge-near", lips: "spread", voiced: true, air: "flow" }),
  ʃ: c("she", "The blade pulls back a little from the /s/ position, wide and raised.", "Slightly rounded and pushed forward.", "Almost closed.", "Flows without stopping. No voice.", "Spanish has “ch” but not this sound. The tongue must not touch first, or “share” becomes “chair”.", "Como para pedir silencio: «shhh». La lengua no toca; si toca, sale «ch».", { tongue: "post", lips: "round", voiced: false, air: "flow" }),
  ʒ: c("measure", "The blade sits just behind the ridge, wide and raised.", "Slightly rounded.", "Almost closed.", "Flows without stopping, with the voice on.", "Spanish has no such sound. It is /ʃ/ with the voice switched on. It is rare, and mostly in the middle of words.", "Como «sh» pero con voz.", { tongue: "post", lips: "round", voiced: true, air: "flow" }),
  h: c("hat", "Resting, already in place for the vowel that follows.", "Open, in the shape of the next vowel.", "Open.", "A soft breath from an open throat. No friction, no voice.", "Spanish j is made with friction at the back of the mouth. English /h/ is only breath, much softer. And unlike Spanish h, it is never silent.", "Solo un soplo suave, sin raspar la garganta. Mucho más suave que la j.", { tongue: "rest", lips: "open", voiced: false, air: "flow" }),
  tʃ: c("check", "The tip and blade press just behind the ridge, then release into /ʃ/.", "Slightly rounded.", "Almost closed.", "Stopped first, then released as a hiss. No voice.", null, "Igual que la ch española.", { tongue: "post", lips: "round", voiced: false, air: "stop" }),
  dʒ: c("job", "The tip and blade press just behind the ridge, then release.", "Slightly rounded.", "Almost closed.", "Stopped first, then released with the voice on.", "It is easily replaced by the Spanish y or ll sound, so “job” sounds like “yob”. The tongue must block the air completely before it lets go.", "Empieza con un cierre completo, como una d, y suelta con voz. No es la y de «yo».", { tongue: "post", lips: "round", voiced: true, air: "stop" }),
  m: c("me", "Resting.", "Pressed together.", "Almost closed.", "Goes out through the nose, with the voice on.", "At the end of a word Spanish turns m into n. In English, close the lips fully: “time”, not “tine”.", "Al final de la palabra, cierra los labios: «time», no «tain».", { tongue: "rest", lips: "closed", voiced: true, air: "nose" }),
  n: c("no", "The tip presses the ridge behind the top teeth.", "Slightly open.", "Slightly open.", "Goes out through the nose, with the voice on.", null, "Igual que la n española.", { tongue: "ridge", lips: "neutral", voiced: true, air: "nose" }),
  ŋ: c("sing", "The back rises to the soft palate. The tip stays down behind the bottom teeth.", "Neutral.", "Slightly open.", "Goes out through the nose, with the voice on.", "Spanish has this sound only before k and g, as in “tengo”. In English it also ends words, with no /g/ after it: “sing”, not “sin” and not “sing-g”.", "Como la n de «tengo», pero sin pronunciar la g después.", { tongue: "velum", lips: "neutral", voiced: true, air: "nose" }),
  w: c("we", "The back is raised, as for “oo”.", "Tightly rounded, then they open quickly.", "Almost closed, then opening.", "Glides straight into the next vowel, with the voice on.", "Spanish often adds a g: “good” for “would”, “gwen” for “when”. Start from rounded lips, with nothing at the back of the mouth.", "Empieza con los labios redondos, sin g delante.", { tongue: "high-back", lips: "round-tight", voiced: true, air: "glide" }),
  l: c("late", "The tip presses the ridge. The sides are lowered.", "Neutral.", "Slightly open.", "Flows around the sides of the tongue, with the voice on.", "At the start of a word it matches Spanish. At the end, English holds it longer and darker: keep the tip on the ridge.", "Al final de la palabra, mantén la punta de la lengua arriba.", { tongue: "ridge", lips: "neutral", voiced: true, air: "glide" }),
  r: c("red", "The tip curls up and back without touching anything. The sides touch the upper back teeth.", "Slightly rounded.", "Slightly open.", "Flows smoothly, with the voice on. No tap and no trill.", "Spanish r taps the ridge and rr trills. The English r never touches the roof of the mouth at all.", "La lengua no toca nada: ni golpe ni vibración. Labios algo redondos.", { tongue: "curl", lips: "round", voiced: true, air: "glide" }),
  j: c("yes", "The body is high and forward, close to the hard palate but not touching.", "Spread.", "Almost closed.", "Glides into the next vowel, with the voice on.", "Spanish y and ll are often made with the tongue touching, which gives “jes” for “yes”. Leave a small gap.", "Como una i muy rápida. La lengua no toca el paladar.", { tongue: "palate", lips: "spread", voiced: true, air: "glide" }),
  i: v("see", "High and far forward, tense.", "Spread, as in a slight smile.", "Almost closed.", "Open and voiced. Hold it: this vowel is long.", "It is the Spanish i, held longer. The trap is using it for short /ɪ/ as well, so “ship” and “sheep” sound the same.", "La i española, más larga y tensa.", { tongue: "high-front", lips: "spread", voiced: true, air: "open" }),
  ɪ: v("sit", "High and forward, but lower and more relaxed than for /i/.", "Relaxed. No smile.", "Slightly more open than for /i/.", "Open and voiced. Keep it short.", "Spanish has only one i, the tense one. English /ɪ/ sits between Spanish i and e: let the tongue go slack and cut it short.", "Entre la i y la e, corta y relajada, sin sonreír.", { tongue: "mid-front", lips: "neutral", voiced: true, air: "open" }),
  eɪ: v("day", "Starts at mid-front, then glides up toward /ɪ/.", "Relaxed, then spreading slightly.", "Half open, then closing.", "Open and voiced. Two parts in one syllable.", "Spanish e is one steady sound. English adds the glide at the end: “day” is not “de”.", "Como «ei» en «rey», no una e sola.", { tongue: "mid-front", lips: "neutral", voiced: true, air: "open", to: { tongue: "high-front", lips: "spread" } }, "diphthong"),
  ɛ: v("bed", "Mid and forward, relaxed.", "Relaxed, slightly spread.", "Half open.", "Open and voiced. Short.", null, "Parecida a la e española, algo más abierta.", { tongue: "mid-front", lips: "neutral", voiced: true, air: "open" }),
  æ: v("cat", "Low and forward. The tip stays behind the bottom teeth.", "Spread wide.", "Wide open.", "Open and voiced.", "Spanish has no vowel here, so it becomes a or e: “bad” sounds like “bed” or “bod”. Open the jaw as for a, and spread the lips as for e.", "Abre la boca como para la a, pero estira los labios como para la e.", { tongue: "low-front", lips: "spread", voiced: true, air: "open" }),
  ɑ: v("hot", "Low and back.", "Open and relaxed, not rounded.", "Wide open.", "Open and voiced.", "Spelled with an o, so it gets the Spanish o. In American English, “hot” and “job” have an open sound close to Spanish a.", "Se escribe con o pero suena casi como una a abierta y posterior.", { tongue: "low-back", lips: "open", voiced: true, air: "open" }),
  ɔ: v("law", "Low-mid and back.", "Slightly rounded.", "Open.", "Open and voiced. One steady sound.", "Close to the Spanish o, but more open and with less rounding. Do not let it close into “oh”.", "Una o más abierta y sostenida.", { tongue: "mid-back", lips: "round", voiced: true, air: "open" }),
  oʊ: v("go", "Starts mid-back, then rises toward /ʊ/.", "Rounded, then closing further.", "Half open, then closing.", "Open and voiced. Two parts in one syllable.", "Spanish o is short and steady. English closes it at the end: “no” moves toward “nou”.", "Como «ou»: empieza en o y cierra hacia u.", { tongue: "mid-back", lips: "round", voiced: true, air: "open", to: { tongue: "high-back", lips: "round-tight" } }, "diphthong"),
  ʊ: v("good", "High and back, but relaxed and a little lower than for /u/.", "Loosely rounded.", "Slightly open.", "Open and voiced. Short.", "Spanish has only one u, the tense one. English /ʊ/ is shorter and looser: “full” is not “fool”.", "Una u corta y relajada, con los labios poco redondeados.", { tongue: "mid-back", lips: "round", voiced: true, air: "open" }),
  u: v("food", "High and far back, tense.", "Tightly rounded and pushed forward.", "Almost closed.", "Open and voiced. Hold it: this vowel is long.", "It is the Spanish u, held longer.", "La u española, más larga.", { tongue: "high-back", lips: "round-tight", voiced: true, air: "open" }),
  ʌ: v("cup", "In the middle of the mouth, relaxed.", "Neutral.", "Half open.", "Open and voiced. Short.", "Spanish uses a full a, or follows the spelling and says o or u. This vowel is shorter and more central than a.", "Una a corta y relajada, con la boca medio abierta.", { tongue: "mid", lips: "neutral", voiced: true, air: "open" }),
  ə: v("about", "At rest in the middle of the mouth.", "Neutral, barely open.", "Barely open.", "Open and voiced. Very short and weak.", "Spanish gives every written vowel its full sound. English reduces unstressed vowels to this one. Saying them in full is what makes speech sound heavy.", "La vocal más débil: muy corta y relajada. No pronuncies la letra escrita.", { tongue: "mid", lips: "neutral", voiced: true, air: "open" }),
  ɝ: v("work", "The tip curls up and back as for /r/, and stays there through the vowel.", "Slightly rounded.", "Slightly open.", "Open and voiced.", "Spanish says the written vowel and then taps an r: “work” becomes “uork”. In English it is one sound, the r itself held as a vowel.", "No hay vocal antes de la r: es la r inglesa sostenida.", { tongue: "curl", lips: "round", voiced: true, air: "open" }),
  ɚ: v("teacher", "The tip curls back as for /r/, briefly.", "Neutral.", "Barely open.", "Open and voiced. Short and weak.", "Spanish says “er” in full, with a tapped r. In English it is a quick, weak r-colored sound.", "Una r inglesa muy corta y débil al final.", { tongue: "curl", lips: "neutral", voiced: true, air: "open" }),
  aɪ: v("time", "Starts low and central, then glides up and forward.", "Open, then spreading.", "Wide open, then closing.", "Open and voiced. Two parts in one syllable.", null, "Como «ai» en «aire».", { tongue: "low-front", lips: "open", voiced: true, air: "open", to: { tongue: "high-front", lips: "spread" } }, "diphthong"),
  aʊ: v("now", "Starts low and central, then glides up and back.", "Open, then rounding.", "Wide open, then closing.", "Open and voiced. Two parts in one syllable.", null, "Como «au» en «causa».", { tongue: "low-front", lips: "open", voiced: true, air: "open", to: { tongue: "high-back", lips: "round" } }, "diphthong"),
  ɔɪ: v("boy", "Starts low-mid and back, then glides up and forward.", "Rounded, then spreading.", "Open, then closing.", "Open and voiced. Two parts in one syllable.", null, "Como «oi» en «hoy».", { tongue: "mid-back", lips: "round", voiced: true, air: "open", to: { tongue: "high-front", lips: "spread" } }, "diphthong"),
};

const ALIASES: Record<string, string> = { g: "ɡ", ɹ: "r", ɜ: "ɝ", ɒ: "ɑ", a: "ɑ", e: "ɛ", o: "oʊ" };

export function libraryEntry(phoneme: string): SoundEntry | null {
  const key = phoneme.replace(/[/ːˈˌ\s]/g, "");
  return SOUND_LIBRARY[key] ?? SOUND_LIBRARY[ALIASES[key] ?? ""] ?? null;
}
