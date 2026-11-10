import { similarity } from "./text";

/**
 * Miscue detection. Azure's enableMiscue does not work in continuous mode, so
 * the recognized words are aligned against the script here.
 *
 * Inputs are normalized words (see `normalizeWord`): lowercase, no punctuation.
 */

export type AlignOp =
  /** Script word and spoken word are the same word. */
  | { type: "match"; refIndex: number; hypIndex: number }
  /** A different but similar-sounding word was recognized in place of the script word. */
  | { type: "substitution"; refIndex: number; hypIndex: number }
  /** Script word was not spoken. */
  | { type: "omission"; refIndex: number }
  /** Spoken word is not in the script at this position. */
  | { type: "insertion"; hypIndex: number };

/** Words at least this similar are treated as one word said wrong, not a skip plus an extra. */
export const SUBSTITUTION_SIMILARITY = 0.5;

const COST_GAP = 2;
const COST_SUBSTITUTION = 3; // cheaper than omission + insertion (4), dearer than one gap

/**
 * Global alignment (Needleman-Wunsch style) of script words against spoken words.
 * Handles repeated words: saying "the the plan" for "the plan" yields one insertion,
 * and the alignment prefers the cheapest overall explanation.
 */
export function alignWords(ref: readonly string[], hyp: readonly string[]): AlignOp[] {
  const n = ref.length;
  const m = hyp.length;
  const width = m + 1;
  const cost = new Float64Array((n + 1) * width);
  // 0 = diagonal, 1 = up (omission), 2 = left (insertion)
  const back = new Uint8Array((n + 1) * width);

  for (let i = 1; i <= n; i++) {
    cost[i * width] = i * COST_GAP;
    back[i * width] = 1;
  }
  for (let j = 1; j <= m; j++) {
    cost[j] = j * COST_GAP;
    back[j] = 2;
  }

  const pairCost = (r: string, h: string): number => {
    if (r === h) return 0;
    return similarity(r, h) >= SUBSTITUTION_SIMILARITY ? COST_SUBSTITUTION : Number.POSITIVE_INFINITY;
  };

  for (let i = 1; i <= n; i++) {
    const r = ref[i - 1] as string;
    for (let j = 1; j <= m; j++) {
      const h = hyp[j - 1] as string;
      const diag = (cost[(i - 1) * width + (j - 1)] as number) + pairCost(r, h);
      const up = (cost[(i - 1) * width + j] as number) + COST_GAP;
      const left = (cost[i * width + (j - 1)] as number) + COST_GAP;
      // Ties prefer the diagonal, then omission, so repeats attach to the earliest script word.
      let best = diag;
      let dir = 0;
      if (up < best) {
        best = up;
        dir = 1;
      }
      if (left < best) {
        best = left;
        dir = 2;
      }
      cost[i * width + j] = best;
      back[i * width + j] = dir;
    }
  }

  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = back[i * width + j];
    if (i > 0 && j > 0 && dir === 0) {
      const same = ref[i - 1] === hyp[j - 1];
      ops.push({ type: same ? "match" : "substitution", refIndex: i - 1, hypIndex: j - 1 });
      i--;
      j--;
    } else if (i > 0 && (dir === 1 || j === 0)) {
      ops.push({ type: "omission", refIndex: i - 1 });
      i--;
    } else {
      ops.push({ type: "insertion", hypIndex: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/**
 * Teleprompter cursor. Given how far we are in the script and the words heard
 * since, return the new position (index of the next word to say).
 * Looks a few words ahead so a skipped or misheard word does not stall the highlight.
 */
export function advanceCursor(
  ref: readonly string[],
  start: number,
  heard: readonly string[],
  lookahead = 4,
): number {
  let pos = start;
  for (const word of heard) {
    const limit = Math.min(ref.length, pos + lookahead);
    for (let k = pos; k < limit; k++) {
      if (ref[k] === word) {
        pos = k + 1;
        break;
      }
    }
  }
  return pos;
}
