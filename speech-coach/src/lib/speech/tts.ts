import { AppError } from "../errors";
import { getSpeechToken } from "./token";

/** Reference pronunciation: Azure neural TTS in Full mode, the browser's own voice otherwise. */

const AZURE_VOICE = "en-US-JennyNeural";

function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new AppError("unsupported", "This browser cannot speak text aloud."));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === "en-US");
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") resolve();
      else reject(new AppError("service", "The browser could not play the reference pronunciation."));
    };
    window.speechSynthesis.speak(utterance);
  });
}

async function speakWithAzure(text: string): Promise<void> {
  const [{ token, region }, sdk] = await Promise.all([
    getSpeechToken(),
    import("microsoft-cognitiveservices-speech-sdk"),
  ]);
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechSynthesisVoiceName = AZURE_VOICE;
  const synthesizer = new sdk.SpeechSynthesizer(config);
  await new Promise<void>((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve();
        else reject(new Error(result.errorDetails || "Azure TTS did not complete."));
      },
      (error) => {
        synthesizer.close();
        reject(new Error(error));
      },
    );
  });
}

export type ReferenceVoice = "azure" | "browser";

/** Speaks `text`. Returns which voice was used, so the UI can say so. */
export async function speakReference(text: string, useAzure: boolean): Promise<ReferenceVoice> {
  if (useAzure) {
    try {
      await speakWithAzure(text);
      return "azure";
    } catch {
      // Fall back to the browser voice so the button still does something useful.
    }
  }
  await speakWithBrowser(text);
  return "browser";
}
