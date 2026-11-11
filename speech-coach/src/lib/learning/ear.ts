import { contentFor, type MinimalPair } from "./content";

/**
 * Ear training: hear one word of a minimal pair, in one of several voices,
 * and pick which it was. You cannot say a contrast you cannot hear.
 */

export interface EarRound {
  index: number;
  pair: MinimalPair;
  /** The word that is played. */
  spoken: string;
  /** Always the pair's two words in a fixed order, so position is not a clue. */
  options: [string, string];
  /** Index into the list of voices. */
  voice: number;
}

export interface EarSummary {
  rounds: number;
  correct: number;
  /** Share correct, 0 to 1. */
  accuracy: number;
  /** Pairs missed at least once. */
  missed: MinimalPair[];
}

/** Small deterministic generator so a drill can be replayed and tested. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Build the rounds for one sound. Each pair is used in turn, the spoken word is
 * random, and voices rotate so no two rounds in a row share a voice when there is a choice.
 */
export function buildEarRounds(phoneme: string, voiceCount: number, rounds: number, random: () => number): EarRound[] {
  const pairs = contentFor(phoneme)?.pairs ?? [];
  if (pairs.length === 0 || rounds <= 0) return [];
  const voices = Math.max(1, voiceCount);
  const out: EarRound[] = [];
  let lastVoice = -1;
  for (let i = 0; i < rounds; i++) {
    const pair = pairs[i % pairs.length] as MinimalPair;
    let voice = Math.floor(random() * voices);
    if (voices > 1 && voice === lastVoice) voice = (voice + 1) % voices;
    lastVoice = voice;
    const options = [pair.target, pair.contrast].sort((a, b) => a.localeCompare(b)) as [string, string];
    out.push({ index: i, pair, spoken: random() < 0.5 ? pair.target : pair.contrast, options, voice });
  }
  return out;
}

/** True when the choice is the word that was played. Case and surrounding space do not matter. */
export function checkEarAnswer(round: EarRound, choice: string): boolean {
  return choice.trim().toLowerCase() === round.spoken.trim().toLowerCase();
}

export function summarizeEar(rounds: readonly EarRound[], answers: readonly (string | null)[]): EarSummary {
  let correct = 0;
  const missed: MinimalPair[] = [];
  rounds.forEach((round, i) => {
    const answer = answers[i];
    if (answer != null && checkEarAnswer(round, answer)) correct += 1;
    else if (answer != null && !missed.includes(round.pair)) missed.push(round.pair);
  });
  const answered = answers.filter((a) => a != null).length;
  return { rounds: answered, correct, accuracy: answered > 0 ? correct / answered : 0, missed };
}
