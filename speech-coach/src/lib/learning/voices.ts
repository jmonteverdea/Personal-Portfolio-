import { AppError } from "../errors";
import { getSpeechToken } from "../speech/token";

/**
 * Several different voices for ear training. Hearing a contrast in one voice
 * is memorising that voice. Hearing it in four is learning the sound.
 * Azure neural voices in Full mode, the browser's own voices otherwise.
 */

export interface EarVoice {
  id: string;
  label: string;
  engine: "azure" | "browser";
}

/** Checked against the Azure voice list. All en-US, two women and two men. */
const AZURE_VOICES: EarVoice[] = [
  { id: "en-US-JennyNeural", label: "Jenny", engine: "azure" },
  { id: "en-US-GuyNeural", label: "Guy", engine: "azure" },
  { id: "en-US-AriaNeural", label: "Aria", engine: "azure" },
  { id: "en-US-DavisNeural", label: "Davis", engine: "azure" },
];

const MAX_BROWSER_VOICES = 4;

function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    const ready = synth.getVoices();
    if (ready.length > 0) {
      resolve(ready);
      return;
    }
    // Chrome fills the list asynchronously.
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
}

export async function browserVoices(): Promise<EarVoice[]> {
  const all = await loadBrowserVoices();
  const english = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const us = english.filter((v) => v.lang.toLowerCase() === "en-us");
  const picked = [...us, ...english.filter((v) => !us.includes(v))].slice(0, MAX_BROWSER_VOICES);
  return picked.map((v) => ({ id: v.voiceURI, label: v.name.replace(/^(Microsoft|Google)\s+/i, "").split(/\s+-|\(/)[0]?.trim() || v.name, engine: "browser" }));
}

/** The voices to drill with: Azure when a key is set, else whatever English voices this browser has. */
export async function listEarVoices(azure: boolean): Promise<EarVoice[]> {
  return azure ? AZURE_VOICES : browserVoices();
}

async function speakAzure(text: string, voiceId: string): Promise<void> {
  const [{ token, region }, sdk] = await Promise.all([getSpeechToken(), import("microsoft-cognitiveservices-speech-sdk")]);
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisVoiceName = voiceId;
  const synthesizer = new sdk.SpeechSynthesizer(config);
  await new Promise<void>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve();
        else reject(new AppError("service", result.errorDetails || "Azure could not play that voice."));
      },
      (error) => {
        synthesizer.close();
        reject(new AppError("service", error));
      },
    );
  });
}

function speakBrowser(text: string, voiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new AppError("unsupported", "This browser cannot speak text aloud."));
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = synth.getVoices().find((v) => v.voiceURI === voiceId);
    try {
      if (voice) utterance.voice = voice;
    } catch {
      // Some browsers reject a voice that has since been unloaded. The default voice still speaks.
    }
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") resolve();
      else reject(new AppError("service", "The browser could not play that voice."));
    };
    synth.speak(utterance);
  });
}

export function speakWithVoice(text: string, voice: EarVoice): Promise<void> {
  return voice.engine === "azure" ? speakAzure(text, voice.id) : speakBrowser(text, voice.id);
}
