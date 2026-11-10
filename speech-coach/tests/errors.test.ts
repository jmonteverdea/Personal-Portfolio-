import { describe, expect, it } from "vitest";
import { AppError, micError, toAppError } from "@/lib/errors";
import { detectMode, modeDescription } from "@/lib/mode";
import { builtInDrill } from "@/lib/drills";

const named = (name: string) => Object.assign(new Error("x"), { name });

describe("microphone errors", () => {
  it("maps permission denial", () => {
    expect(micError(named("NotAllowedError")).code).toBe("mic_denied");
    expect(micError(named("SecurityError")).code).toBe("mic_denied");
  });
  it("maps a missing or busy device", () => {
    expect(micError(named("NotFoundError")).code).toBe("mic_missing");
    expect(micError(named("NotReadableError")).message).toMatch(/in use/);
    expect(micError("weird").code).toBe("mic_missing");
  });
  it("keeps AppErrors and wraps everything else", () => {
    const original = new AppError("network", "down");
    expect(toAppError(original)).toBe(original);
    expect(toAppError(new Error("boom")).message).toBe("boom");
    expect(toAppError(null, "fallback").message).toBe("fallback");
  });
});

describe("mode detection", () => {
  it("is Full with an Azure key and Transcript-only without", () => {
    expect(detectMode({ azure: true, anthropic: true })).toBe("full");
    expect(detectMode({ azure: true, anthropic: false })).toBe("full");
    expect(detectMode({ azure: false, anthropic: true })).toBe("transcript");
    expect(detectMode({ azure: false, anthropic: false })).toBe("transcript");
  });
  it("says what is unavailable", () => {
    expect(modeDescription({ azure: false, anthropic: false })).toMatch(/Phoneme scoring and coaching are unavailable/);
    expect(modeDescription({ azure: true, anthropic: false })).toMatch(/Coaching is off/);
  });
});

describe("built-in drills", () => {
  it("covers the usual Spanish-speaker problem sounds", () => {
    for (const p of ["v", "θ", "ð", "ɪ", "i", "z", "t", "d", "ʊ"]) expect(builtInDrill(p)?.script.length).toBeGreaterThan(80);
  });
  it("returns null for sounds it has no drill for", () => {
    expect(builtInDrill("ʒ")).toBeNull();
  });
});
