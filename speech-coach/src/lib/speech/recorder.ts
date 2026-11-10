/** MediaRecorder wrapper for replaying my own take. This audio never goes to Azure. */

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export interface TakeRecorder {
  stop(): Promise<Blob | null>;
}

export function startTakeRecorder(stream: MediaStream): TakeRecorder | null {
  if (typeof MediaRecorder === "undefined") return null;
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    return null;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        const finish = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }) : null);
        if (recorder.state === "inactive") {
          finish();
          return;
        }
        recorder.onstop = finish;
        recorder.onerror = finish;
        try {
          recorder.stop();
        } catch {
          finish();
        }
      }),
  };
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
