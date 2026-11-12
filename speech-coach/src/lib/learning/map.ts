/**
 * Where each English sound sits on the Sound Map. Consonants are placed by
 * where and how they are made, vowels by tongue position, the way a phonetics
 * chart does it. So the map is also a picture of the mouth.
 */

export const PLACES = ["Lips", "Lip + teeth", "Teeth", "Ridge", "Behind ridge", "Palate", "Soft palate", "Throat"] as const;
export const MANNERS = ["Stops", "Fricatives", "Affricates", "Nasals", "Glides"] as const;

export interface ConsonantSpot {
  phoneme: string;
  place: number;
  manner: number;
  /** Voiceless sits left in its cell, voiced right, alone in the middle. */
  side: -1 | 0 | 1;
}

export const CONSONANTS: ConsonantSpot[] = [
  { phoneme: "p", place: 0, manner: 0, side: -1 },
  { phoneme: "b", place: 0, manner: 0, side: 1 },
  { phoneme: "t", place: 3, manner: 0, side: -1 },
  { phoneme: "d", place: 3, manner: 0, side: 1 },
  { phoneme: "k", place: 6, manner: 0, side: -1 },
  { phoneme: "ɡ", place: 6, manner: 0, side: 1 },
  { phoneme: "f", place: 1, manner: 1, side: -1 },
  { phoneme: "v", place: 1, manner: 1, side: 1 },
  { phoneme: "θ", place: 2, manner: 1, side: -1 },
  { phoneme: "ð", place: 2, manner: 1, side: 1 },
  { phoneme: "s", place: 3, manner: 1, side: -1 },
  { phoneme: "z", place: 3, manner: 1, side: 1 },
  { phoneme: "ʃ", place: 4, manner: 1, side: -1 },
  { phoneme: "ʒ", place: 4, manner: 1, side: 1 },
  { phoneme: "h", place: 7, manner: 1, side: 0 },
  { phoneme: "tʃ", place: 4, manner: 2, side: -1 },
  { phoneme: "dʒ", place: 4, manner: 2, side: 1 },
  { phoneme: "m", place: 0, manner: 3, side: 0 },
  { phoneme: "n", place: 3, manner: 3, side: 0 },
  { phoneme: "ŋ", place: 6, manner: 3, side: 0 },
  { phoneme: "w", place: 0, manner: 4, side: 0 },
  { phoneme: "l", place: 3, manner: 4, side: 0 },
  { phoneme: "r", place: 4, manner: 4, side: 0 },
  { phoneme: "j", place: 5, manner: 4, side: 0 },
];

export interface VowelSpot {
  phoneme: string;
  /** 0 front of the mouth, 1 back. */
  x: number;
  /** 0 tongue high, 1 tongue low. */
  y: number;
}

export const VOWELS: VowelSpot[] = [
  { phoneme: "i", x: 0.06, y: 0.06 },
  { phoneme: "ɪ", x: 0.24, y: 0.22 },
  { phoneme: "eɪ", x: 0.12, y: 0.42 },
  { phoneme: "ɛ", x: 0.3, y: 0.58 },
  { phoneme: "æ", x: 0.3, y: 0.86 },
  { phoneme: "ɝ", x: 0.5, y: 0.26 },
  { phoneme: "ə", x: 0.5, y: 0.5 },
  { phoneme: "ɚ", x: 0.68, y: 0.38 },
  { phoneme: "ʌ", x: 0.62, y: 0.68 },
  { phoneme: "u", x: 0.94, y: 0.06 },
  { phoneme: "ʊ", x: 0.8, y: 0.22 },
  { phoneme: "oʊ", x: 0.92, y: 0.42 },
  { phoneme: "ɔ", x: 0.92, y: 0.64 },
  { phoneme: "ɑ", x: 0.86, y: 0.9 },
  { phoneme: "aɪ", x: 0.48, y: 0.92 },
  { phoneme: "aʊ", x: 0.67, y: 0.92 },
  { phoneme: "ɔɪ", x: 0.78, y: 0.76 },
];

/** Symbols Azure may use for the same sound. */
const ALIASES: Record<string, string> = { g: "ɡ", ɹ: "r", ɜ: "ɝ", ɒ: "ɑ", a: "ɑ", e: "ɛ", o: "oʊ", ɫ: "l" };

export function canonical(phoneme: string): string {
  const key = phoneme.replace(/[ːˈˌ]/g, "");
  return ALIASES[key] ?? key;
}

const KNOWN = new Set([...CONSONANTS.map((c) => c.phoneme), ...VOWELS.map((v) => v.phoneme)]);

/** Sounds I have practised that have no fixed place on the chart. They get a row of their own. */
export function unplaced(phonemes: Iterable<string>): string[] {
  return [...new Set([...phonemes].map(canonical))].filter((p) => !KNOWN.has(p)).sort();
}
