/**
 * Pitch extraction and contour comparison for shadowing. Pure, no Web Audio:
 * it works on raw samples so it can be unit-tested with a synthetic tone.
 * The method is the YIN difference function with a clarity threshold.
 */

export interface PitchOptions {
  /** Time between pitch estimates. */
  hopMs?: number;
  /** Analysis window. Must hold at least two periods of the lowest pitch. */
  windowMs?: number;
  minHz?: number;
  maxHz?: number;
  /** Frames quieter than this RMS are treated as silence. */
  silenceRms?: number;
  /** YIN clarity threshold. Lower is stricter. */
  threshold?: number;
}

export interface Contour {
  /** Time of each frame, in milliseconds. */
  timesMs: number[];
  /** Fundamental frequency per frame, or null where the frame is silent or unvoiced. */
  hz: (number | null)[];
}

const TARGET_RATE = 16_000;

/** Cheap downsample by averaging, enough for pitch (which lives far below 8 kHz). */
export function downsample(samples: Float32Array, fromRate: number, toRate = TARGET_RATE): { samples: Float32Array; rate: number } {
  const factor = Math.floor(fromRate / toRate);
  if (factor <= 1) return { samples, rate: fromRate };
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k] ?? 0;
    out[i] = sum / factor;
  }
  return { samples: out, rate: fromRate / factor };
}

export function extractPitch(input: Float32Array, sampleRate: number, options: PitchOptions = {}): Contour {
  const { hopMs = 10, windowMs = 40, minHz = 70, maxHz = 420, silenceRms = 0.012, threshold = 0.15 } = options;
  const { samples, rate } = downsample(input, sampleRate);
  const window = Math.round((windowMs / 1000) * rate);
  const hop = Math.round((hopMs / 1000) * rate);
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const maxLag = Math.min(Math.floor(window / 2), Math.ceil(rate / minHz));
  const timesMs: number[] = [];
  const hz: (number | null)[] = [];
  const diff = new Float32Array(maxLag + 1);

  for (let start = 0; start + window <= samples.length; start += hop) {
    timesMs.push(Math.round(((start + window / 2) / rate) * 1000));
    let energy = 0;
    for (let i = 0; i < window; i++) energy += (samples[start + i] ?? 0) ** 2;
    if (Math.sqrt(energy / window) < silenceRms) {
      hz.push(null);
      continue;
    }
    // Difference function, then its cumulative mean normalised form.
    const span = window - maxLag;
    let running = 0;
    let found = -1;
    diff[0] = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
      let d = 0;
      for (let i = 0; i < span; i++) {
        const delta = (samples[start + i] ?? 0) - (samples[start + i + lag] ?? 0);
        d += delta * delta;
      }
      running += d;
      diff[lag] = running > 0 ? (d * lag) / running : 1;
    }
    for (let lag = minLag; lag <= maxLag; lag++) {
      if ((diff[lag] as number) < threshold) {
        // Walk down to the local minimum.
        while (lag + 1 <= maxLag && (diff[lag + 1] as number) < (diff[lag] as number)) lag++;
        found = lag;
        break;
      }
    }
    if (found === -1) {
      hz.push(null);
      continue;
    }
    // Parabolic interpolation around the minimum for sub-sample accuracy.
    const a = diff[found - 1] ?? diff[found]!;
    const b = diff[found] as number;
    const c = diff[found + 1] ?? b;
    const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
    hz.push(rate / (found + shift));
  }
  return { timesMs, hz };
}

/** Remove single-frame octave jumps and blips with a median of three voiced neighbours. */
export function smoothContour(contour: Contour): Contour {
  const hz = contour.hz.map((value, i) => {
    if (value === null) return null;
    const near = [contour.hz[i - 1], value, contour.hz[i + 1]].filter((v): v is number => v != null).sort((a, b) => a - b);
    return near[Math.floor((near.length - 1) / 2)] ?? value;
  });
  // A voiced frame with silence on both sides is noise, not speech.
  return { timesMs: contour.timesMs, hz: hz.map((v, i) => (v !== null && hz[i - 1] == null && hz[i + 1] == null ? null : v)) };
}

export function medianHz(contour: Contour): number | null {
  const voiced = contour.hz.filter((v): v is number => v !== null).sort((a, b) => a - b);
  return voiced.length ? (voiced[Math.floor(voiced.length / 2)] as number) : null;
}

/**
 * Pitch in semitones relative to the speaker's own median. This is what makes
 * two different voices comparable: only the movement is left, not the register.
 */
export function toSemitones(contour: Contour): (number | null)[] {
  const reference = medianHz(contour);
  if (reference === null) return contour.hz.map(() => null);
  return contour.hz.map((v) => (v === null ? null : 12 * Math.log2(v / reference)));
}

/** How far the pitch moves: the spread between the 10th and 90th percentile, in semitones. */
export function pitchRange(contour: Contour): number | null {
  const st = toSemitones(contour).filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (st.length < 5) return null;
  const at = (q: number) => st[Math.min(st.length - 1, Math.floor(q * st.length))] as number;
  return Math.round((at(0.9) - at(0.1)) * 10) / 10;
}

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** Mean relative pitch over each word, in semitones. Null for a word with no voiced frames. */
export function pitchPerWord(contour: Contour, words: readonly TimedWord[]): (number | null)[] {
  const st = toSemitones(contour);
  return words.map((w) => {
    const values = st.filter((v, i): v is number => v !== null && (contour.timesMs[i] as number) >= w.startMs && (contour.timesMs[i] as number) <= w.endMs);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
}

function peakIndex(values: readonly (number | null)[]): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v !== null && (best === null || v > (values[best] as number))) best = i;
  });
  return best;
}

export interface ContourComparison {
  modelRange: number | null;
  myRange: number | null;
  /** My pitch moves less than 60% as far as the model's. */
  flat: boolean;
  /** The word carrying the highest pitch, for each voice. Null without word timing. */
  modelPeakWord: string | null;
  myPeakWord: string | null;
  /** The stress peak landed on a different word. */
  stressShifted: boolean;
}

/** A model that barely moves is not a useful yardstick for "flat". */
const MIN_MODEL_RANGE = 2;
const FLAT_RATIO = 0.6;

export function compareContours(model: Contour, mine: Contour, modelWords: readonly TimedWord[] = [], myWords: readonly TimedWord[] = []): ContourComparison {
  const modelRange = pitchRange(model);
  const myRange = pitchRange(mine);
  const flat = modelRange !== null && myRange !== null && modelRange >= MIN_MODEL_RANGE && myRange < modelRange * FLAT_RATIO;
  const modelPeak = modelWords.length ? peakIndex(pitchPerWord(model, modelWords)) : null;
  const myPeak = myWords.length ? peakIndex(pitchPerWord(mine, myWords)) : null;
  const modelPeakWord = modelPeak === null ? null : modelWords[modelPeak]?.text ?? null;
  const myPeakWord = myPeak === null ? null : myWords[myPeak]?.text ?? null;
  return {
    modelRange,
    myRange,
    flat,
    modelPeakWord,
    myPeakWord,
    stressShifted: modelPeakWord !== null && myPeakWord !== null && modelPeakWord.toLowerCase() !== myPeakWord.toLowerCase(),
  };
}

/** Split a sentence into short chunks to shadow: at punctuation first, then by length. */
export function chunkSentence(sentence: string, maxWords = 7): string[] {
  const pieces = sentence.split(/(?<=[,;:])\s+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const piece of pieces) {
    const words = piece.split(/\s+/);
    if (words.length <= maxWords + 3) {
      chunks.push(piece);
      continue;
    }
    const parts = Math.ceil(words.length / maxWords);
    const size = Math.ceil(words.length / parts);
    for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(" "));
  }
  // A one- or two-word chunk is too short to carry intonation: join it to its neighbour.
  return chunks.reduce<string[]>((out, chunk) => {
    const last = out[out.length - 1];
    if (last !== undefined && (chunk.split(/\s+/).length < 3 || last.split(/\s+/).length < 3)) out[out.length - 1] = `${last} ${chunk}`;
    else out.push(chunk);
    return out;
  }, []);
}
