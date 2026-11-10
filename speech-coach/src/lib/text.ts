/** Pure text helpers shared by the diff, the teleprompter and the normalizer. */

export interface ScriptToken {
  /** Word as written in the script, with attached punctuation. */
  display: string;
  /** Lowercase, punctuation-free form used for comparison. Never empty. */
  norm: string;
  sentenceIndex: number;
}

/** Lowercase and strip everything except letters, digits and in-word apostrophes. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, "")
    .replace(/^'+|'+$/g, "");
}

/**
 * Split text into comparable words. Hyphens, dashes and slashes separate words
 * because Azure reports "follow-up" as two words.
 */
export function splitWords(text: string): string[] {
  return text
    .replace(/[‐-―/]/g, " ")
    .replace(/(\p{L})-(\p{L})/gu, "$1 $2")
    .split(/\s+/)
    .filter((w) => normalizeWord(w).length > 0);
}

export function normalizeWords(text: string): string[] {
  return splitWords(text).map(normalizeWord);
}

/** Split a script into sentences on ., ! and ? (and line breaks). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const parts = line.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [];
    for (const p of parts) {
      const s = p.trim();
      if (normalizeWords(s).length > 0) out.push(s);
    }
  }
  return out;
}

/** Script words in order, each tagged with its sentence. */
export function tokenizeScript(text: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  splitSentences(text).forEach((sentence, sentenceIndex) => {
    for (const display of splitWords(sentence)) {
      tokens.push({ display, norm: normalizeWord(display), sentenceIndex });
    }
  });
  return tokens;
}

/** True when the script has digits, which Azure reads out as words ("15" becomes "fifteen"). */
export function hasDigits(text: string): boolean {
  return /\d/.test(text);
}

/** Levenshtein distance between two short strings. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** 1 for identical words, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}
