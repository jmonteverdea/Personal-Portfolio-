/** Reads loudness and three rough frequency bands from a microphone stream through an AnalyserNode. */

export interface Levels {
  /** Smoothed loudness, 0 (silence) to 1 (loud speech). */
  level: number;
  /** Low, mid and high band energy, each 0 to 1. Voice pitch, vowels, consonant hiss. */
  low: number;
  mid: number;
  high: number;
}

export interface LevelMeter {
  read(): Levels;
  dispose(): void;
}

export const SILENT: Levels = { level: 0, low: 0, mid: 0, high: 0 };

export function createLevelMeter(stream: MediaStream): LevelMeter {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);

  const time = new Uint8Array(analyser.fftSize);
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const hzPerBin = context.sampleRate / analyser.fftSize;
  const bin = (hz: number) => Math.min(freq.length - 1, Math.max(0, Math.round(hz / hzPerBin)));
  const ranges: [number, number][] = [
    [bin(80), bin(320)],
    [bin(320), bin(2000)],
    [bin(2000), bin(7000)],
  ];
  const state: Levels = { level: 0, low: 0, mid: 0, high: 0 };

  const average = ([from, to]: [number, number]): number => {
    let sum = 0;
    for (let i = from; i <= to; i++) sum += freq[i] ?? 0;
    return sum / ((to - from + 1) * 255);
  };
  // Fast attack, slow release: the field jumps with a syllable and settles like breath.
  const follow = (current: number, target: number): number => current + (target - current) * (target > current ? 0.45 : 0.07);

  return {
    read() {
      analyser.getByteTimeDomainData(time);
      analyser.getByteFrequencyData(freq);
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = ((time[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);
      // Speech sits around 0.02 to 0.25 RMS. Gate the noise floor, then compress.
      const loud = Math.min(1, Math.pow(Math.max(0, rms - 0.012) * 4.2, 0.72));
      state.level = follow(state.level, loud);
      state.low = follow(state.low, Math.min(1, average(ranges[0] as [number, number]) * 1.5));
      state.mid = follow(state.mid, Math.min(1, average(ranges[1] as [number, number]) * 2.2));
      state.high = follow(state.high, Math.min(1, average(ranges[2] as [number, number]) * 3.4));
      return state;
    },
    dispose() {
      source.disconnect();
      void context.close();
    },
  };
}
