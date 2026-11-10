import { AppError } from "../errors";

/**
 * Plays slices of my own take. MediaRecorder output has no seek index, so
 * seeking an <audio> element is unreliable. Decoding to an AudioBuffer makes
 * "play from offset for duration" exact.
 */

/** Azure's word boundaries are tight. A little padding keeps consonants from being clipped. */
const PAD_MS = 140;

let context: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
const decoded = new WeakMap<Blob, Promise<AudioBuffer>>();

function getContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

function decode(blob: Blob): Promise<AudioBuffer> {
  let pending = decoded.get(blob);
  if (!pending) {
    pending = blob.arrayBuffer().then((data) => getContext().decodeAudioData(data));
    decoded.set(blob, pending);
  }
  return pending;
}

export function stopPlayback(): void {
  try {
    current?.stop();
  } catch {
    // already stopped
  }
  current = null;
}

/** Play `durationMs` of the take starting at `offsetMs`. Resolves when playback ends. */
export async function playSlice(blob: Blob, offsetMs: number, durationMs: number): Promise<void> {
  let buffer: AudioBuffer;
  try {
    buffer = await decode(blob);
  } catch {
    decoded.delete(blob);
    throw new AppError("service", "This browser could not decode the recording for word replay.");
  }
  const ctx = getContext();
  if (ctx.state === "suspended") await ctx.resume();
  stopPlayback();

  const start = Math.max(0, (offsetMs - PAD_MS) / 1000);
  const length = Math.min(buffer.duration - start, (durationMs + 2 * PAD_MS) / 1000);
  if (length <= 0) throw new AppError("service", "That word falls outside the recording.");

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  current = source;
  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (current === source) current = null;
      resolve();
    };
    source.start(0, start, length);
  });
}
