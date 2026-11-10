import type { AppConfig, AppMode } from "./types";

/** Which mode the app runs in, from which keys the server has. */
export function detectMode(config: AppConfig): AppMode {
  return config.azure ? "full" : "transcript";
}

export const MODE_LABEL: Record<AppMode, string> = {
  full: "Full",
  transcript: "Transcript-only",
  demo: "Demo",
};

export function modeDescription(config: AppConfig): string {
  if (config.azure && config.anthropic) return "Azure scoring and Claude coaching are both on.";
  if (config.azure) return "Azure scoring is on. Coaching is off: no Anthropic key.";
  if (config.anthropic)
    return "No Azure key: recordings get a transcript and word diff only. Phoneme scoring is unavailable. Coaching is on.";
  return "No keys set: recordings get a transcript and word diff only. Phoneme scoring and coaching are unavailable. Load the sample result to see every screen.";
}
