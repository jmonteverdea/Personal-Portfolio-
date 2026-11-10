import type { AppConfig } from "./types";

/** Server-only. Reads env at request time and never returns the values themselves. */
export function getServerConfig(): AppConfig {
  return {
    azure: Boolean(process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };
}
