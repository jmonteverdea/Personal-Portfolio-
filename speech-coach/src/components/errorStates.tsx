import type { ReactNode } from "react";
import type { AppError, AppErrorCode } from "@/lib/errors";
import { StateBlock, type StateKind } from "./ds/ui";

/** How each failure is presented: its figure and a calm, specific headline. */
const PRESENT: Record<AppErrorCode, { kind: StateKind; title: string }> = {
  mic_denied: { kind: "mic", title: "The microphone is blocked." },
  mic_missing: { kind: "mic", title: "No microphone was found." },
  unsupported: { kind: "browser", title: "This browser cannot do that." },
  no_speech: { kind: "silence", title: "Nothing was heard." },
  network: { kind: "network", title: "The connection dropped." },
  token: { kind: "token", title: "Azure Speech is not reachable." },
  token_expired: { kind: "token", title: "The speech key expired." },
  not_configured: { kind: "info", title: "This needs a key." },
  service: { kind: "error", title: "The take stopped early." },
};

export function ErrorState({ error, action, compact = false }: { error: AppError; action?: ReactNode; compact?: boolean }) {
  const { kind, title } = PRESENT[error.code];
  return (
    <StateBlock kind={kind} title={title} action={action} compact={compact}>
      {error.message}
    </StateBlock>
  );
}
