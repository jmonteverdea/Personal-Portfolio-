import { AppError } from "../errors";
import { getSpeechToken } from "../speech/token";
import { extractPitch, smoothContour, type Contour, type TimedWord } from "./pitch";

/**
 * The model voice as audio I can analyse, not just hear. Azure text-to-speech
 * returns the samples and the timing of every word, which is what the pitch
 * comparison needs. The browser's own voices cannot do this: they only play.
 */

const VOICE = "en-US-JennyNeural";
const TICKS_PER_MS = 10_000;

export interface ModelAudio {
  buffer: AudioBuffer;
  words: TimedWord[];
  contour: Contour;
}

let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

export function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

const escapeXml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Pitch contour of a decoded recording. */
export function contourOf(buffer: AudioBuffer): Contour {
  return smoothContour(extractPitch(buffer.getChannelData(0), buffer.sampleRate));
}

/** Synthesize a sentence with Azure at a speaking rate (1 is normal, 0.8 is slower). Keeps the pitch natural at any rate. */
export async function synthesizeModel(text: string, rate: number): Promise<ModelAudio> {
  const [{ token, region }, sdk] = await Promise.all([getSpeechToken(), import("microsoft-cognitiveservices-speech-sdk")]);
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  // A null audio output: the SDK hands back the samples and plays nothing itself.
  const synthesizer = new sdk.SpeechSynthesizer(config, null);
  const words: TimedWord[] = [];
  synthesizer.wordBoundary = (_sender, event) => {
    if (event.boundaryType !== sdk.SpeechSynthesisBoundaryType.Word) return;
    const startMs = event.audioOffset / TICKS_PER_MS;
    words.push({ text: event.text.toLowerCase(), startMs, endMs: startMs + Math.max(60, event.duration / TICKS_PER_MS) });
  };
  const percent = Math.round((rate - 1) * 100);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${VOICE}"><prosody rate="${percent >= 0 ? "+" : ""}${percent}%">${escapeXml(text)}</prosody></voice></speak>`;
  const data = await new Promise<ArrayBuffer>((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted && result.audioData.byteLength > 0) resolve(result.audioData);
        else reject(new AppError("service", result.errorDetails || "Azure could not synthesize the model voice."));
      },
      (error) => {
        synthesizer.close();
        reject(new AppError("service", error));
      },
    );
  });
  const buffer = await audioContext().decodeAudioData(data.slice(0));
  return { buffer, words, contour: contourOf(buffer) };
}

/** Decode my own recording so its pitch can be measured. */
export async function decodeTake(blob: Blob): Promise<AudioBuffer> {
  return audioContext().decodeAudioData(await blob.arrayBuffer());
}

export function stopBuffer(): void {
  try {
    playing?.stop();
  } catch {
    // already stopped
  }
  playing = null;
}

/** Play a decoded buffer through the speakers. Resolves when it ends. */
export async function playBuffer(buffer: AudioBuffer): Promise<void> {
  const ctx = audioContext();
  if (ctx.state === "suspended") await ctx.resume();
  stopBuffer();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  playing = source;
  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    source.start();
  });
}
