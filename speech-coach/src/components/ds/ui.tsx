import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { MASTERY_NAMES, type MasteryLevel } from "@/lib/learning/mastery";
import type { WordResult } from "@/lib/types";

/* ---------- buttons ---------- */

type Variant = "solid" | "signal" | "outline" | "quiet";

const BASE =
  "press inline-flex items-center justify-center gap-2.5 whitespace-nowrap font-medium disabled:cursor-not-allowed disabled:opacity-40 select-none";
const VARIANTS: Record<Variant, string> = {
  solid: "bg-fg text-bg hover:bg-signal",
  signal: "bg-signal text-bg hover:opacity-90",
  outline: "border border-fg text-fg hover:bg-fg hover:text-bg",
  quiet: "text-fg-2 hover:text-fg underline decoration-rule-strong underline-offset-4 hover:decoration-fg",
};
const SIZES = { sm: "h-9 px-3.5 text-[0.8125rem]", md: "h-11 px-5 text-sm", lg: "h-14 px-7 text-base" };

function classes(variant: Variant, size: keyof typeof SIZES, extra = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${variant === "quiet" ? "h-auto px-0 text-sm" : SIZES[size]} ${extra}`;
}

export function Button({
  variant = "outline",
  size = "md",
  busy = false,
  hotkey,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; busy?: boolean; hotkey?: string }) {
  return (
    <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={classes(variant, size, className)}>
      {busy && <Spinner />}
      {children}
      {hotkey && <Kbd inverted={variant === "solid" || variant === "signal"}>{hotkey}</Kbd>}
    </button>
  );
}

export function LinkButton({
  variant = "outline",
  size = "md",
  hotkey,
  className = "",
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZES; hotkey?: string }) {
  return (
    <Link {...rest} className={classes(variant, size, className)}>
      {children}
      {hotkey && <Kbd inverted={variant === "solid" || variant === "signal"}>{hotkey}</Kbd>}
    </Link>
  );
}

export function Kbd({ children, inverted = false }: { children: ReactNode; inverted?: boolean }) {
  return (
    <kbd
      className={`label !tracking-[0.06em] inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border px-1 !text-[0.625rem] ${
        inverted ? "border-current opacity-70" : "border-rule-strong text-fg-2"
      }`}
    >
      {children}
    </kbd>
  );
}

export function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="14 42" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- structure ---------- */

export function Label({ children, className = "", as: Tag = "p" }: { children: ReactNode; className?: string; as?: "p" | "span" | "h2" | "h3" | "div" }) {
  return <Tag className={`label text-fg-3 ${className}`}>{children}</Tag>;
}

/** A framed area with atlas corner ticks and an optional caption row. */
export function Plate({
  caption,
  aside,
  children,
  className = "",
  flush = false,
}: {
  caption?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`ticks border border-rule ${className}`}>
      {(caption || aside) && (
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule px-5 py-3 sm:px-7">
          {caption && <Label as="h2">{caption}</Label>}
          {aside}
        </header>
      )}
      <div className={flush ? "" : "px-5 py-6 sm:px-7 sm:py-7"}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, children, aside }: { eyebrow: ReactNode; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6 sm:mb-14">
      <div className="max-w-3xl">
        <Label className="rise">{eyebrow}</Label>
        <h1 className="display rise mt-3 text-(length:--text-display-m)" style={{ "--i": 1 } as React.CSSProperties}>
          {title}
        </h1>
        {children && (
          <p className="rise mt-5 max-w-xl text-base leading-relaxed text-fg-2" style={{ "--i": 2 } as React.CSSProperties}>
            {children}
          </p>
        )}
      </div>
      {aside && (
        <div className="rise flex flex-wrap gap-3" style={{ "--i": 3 } as React.CSSProperties}>
          {aside}
        </div>
      )}
    </header>
  );
}

/* ---------- designed states ---------- */

export type StateKind = "empty" | "loading" | "mic" | "silence" | "network" | "token" | "browser" | "error" | "info";

/** Each state has its own small figure, drawn in the same contour language as everything else. */
function StateFigure({ kind }: { kind: StateKind }) {
  const ring = (r: number, extra: React.SVGProps<SVGCircleElement> = {}) => (
    <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="1.2" {...extra} />
  );
  return (
    <svg viewBox="0 0 120 120" className="h-24 w-24 shrink-0 text-fg" aria-hidden>
      {kind === "silence" && (
        <>
          <line x1="8" y1="60" x2="112" y2="60" stroke="currentColor" strokeWidth="1.2" />
          {[18, 34].map((r) => ring(r, { opacity: 0.25, strokeDasharray: "2 5" }))}
        </>
      )}
      {kind === "mic" && (
        <>
          {[16, 30, 44].map((r) => ring(r, { strokeDasharray: `${r * 2.2} ${r * 4}`, transform: "rotate(-60 60 60)" }))}
          <line x1="24" y1="96" x2="96" y2="24" stroke="var(--signal)" strokeWidth="2" />
        </>
      )}
      {kind === "network" && [14, 28, 42].map((r, i) => ring(r, { strokeDasharray: "3 6", opacity: 1 - i * 0.28 }))}
      {kind === "token" && (
        <>
          {ring(40)}
          {ring(40, { stroke: "var(--signal)", strokeWidth: 2, strokeDasharray: "62 252", transform: "rotate(-90 60 60)" })}
          <path d="M60 36v24l14 10" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </>
      )}
      {kind === "browser" && (
        <>
          <rect x="18" y="28" width="84" height="64" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="18" y1="42" x2="102" y2="42" stroke="currentColor" strokeWidth="1.2" />
          {ring(12, { cy: 67, opacity: 0.4, strokeDasharray: "2 4" })}
        </>
      )}
      {(kind === "empty" || kind === "info" || kind === "loading") &&
        [10, 22, 34, 46].map((r, i) => ring(r, { opacity: kind === "empty" ? 0.2 + i * 0.12 : 1 - i * 0.22, strokeDasharray: kind === "empty" ? "1 5" : undefined }))}
      {kind === "error" && (
        <>
          {[20, 36].map((r) => ring(r, { opacity: 0.35 }))}
          <path d="M60 30v36M60 78v4" stroke="var(--signal)" strokeWidth="2.4" strokeLinecap="square" />
        </>
      )}
    </svg>
  );
}

export function StateBlock({
  kind,
  title,
  children,
  action,
  compact = false,
}: {
  kind: StateKind;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  const alert = kind === "error" || kind === "mic" || kind === "network" || kind === "token" || kind === "silence" || kind === "browser";
  return (
    <div
      role={alert ? "alert" : "status"}
      className={`ticks flex flex-col gap-5 border border-rule sm:flex-row sm:items-center ${compact ? "p-5" : "p-6 sm:p-9"} ${alert ? "border-l-2 border-l-signal" : ""}`}
    >
      {!compact && <StateFigure kind={kind} />}
      <div className="min-w-0 flex-1">
        <Label>{STATE_LABEL[kind]}</Label>
        <p className={`display mt-2 ${compact ? "text-2xl" : "text-(length:--text-display-s)"}`}>{title}</p>
        {children && <div className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-fg-2">{children}</div>}
        {action && <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">{action}</div>}
      </div>
    </div>
  );
}

const STATE_LABEL: Record<StateKind, string> = {
  empty: "Nothing here yet",
  loading: "One moment",
  mic: "Microphone",
  silence: "Signal",
  network: "Connection",
  token: "Session key",
  browser: "Browser",
  error: "Something stopped",
  info: "Note",
};

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-5 text-fg-3">
      <svg viewBox="0 0 120 120" className="h-16 w-16 animate-[spin_6s_linear_infinite]" aria-hidden>
        {[14, 28, 42].map((r, i) => (
          <circle key={r} cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={`${r * 1.6} ${r * 5}`} transform={`rotate(${i * 70} 60 60)`} />
        ))}
      </svg>
      <Label>{label}</Label>
    </div>
  );
}

/** A small inline note. For anything that deserves attention use StateBlock. */
export function Note({ children, tone = "quiet" }: { children: ReactNode; tone?: "quiet" | "signal" }) {
  return (
    <p className={`border-l-2 pl-4 text-sm leading-relaxed ${tone === "signal" ? "border-signal text-fg" : "border-rule-strong text-fg-2"}`}>{children}</p>
  );
}

/* ---------- sounds, scores, mastery ---------- */

export function Sound({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`ipa whitespace-nowrap ${className}`}>
      <span className="opacity-35">/</span>
      {children}
      <span className="opacity-35">/</span>
    </span>
  );
}

export type Band = "good" | "fair" | "poor";

export function band(score: number): Band {
  return score >= 80 ? "good" : score >= 60 ? "fair" : "poor";
}

export const BAND_TEXT: Record<Band, string> = { good: "text-good", fair: "text-fair", poor: "text-poor" };
export const BAND_BG: Record<Band, string> = { good: "bg-good", fair: "bg-fair", poor: "bg-poor" };
export const BAND_WORD: Record<Band, string> = { good: "held", fair: "close", poor: "not yet" };

/** Class for a word in a painted script. The underline style carries the level, so it reads without color. */
export function wordClass(word: Pick<WordResult, "status" | "accuracy">): string {
  if (word.status === "omission") return "w-omit";
  if (word.status === "insertion") return "w-insert";
  if (word.accuracy === null) return "w-plain";
  if (word.status === "mispronounced" || word.accuracy < 60) return "w-poor";
  return word.accuracy < 80 ? "w-fair" : "w-good";
}

/** A thin instrument bar with a tick at the 80 line. */
export function ScoreBar({ label, score, hint }: { label: string; score: number | null; hint?: string }) {
  const b = score === null ? null : band(Math.round(score));
  return (
    <div data-count-row>
      <div className="flex items-baseline justify-between gap-3">
        <Label as="span">{label}</Label>
        <span className={`font-mono text-sm tabular-nums ${b ? BAND_TEXT[b] : "text-fg-3"}`}>
          {score === null ? "n/a" : <span data-count={Math.round(score)}>{Math.round(score)}</span>}
        </span>
      </div>
      <div className="relative mt-2 h-[3px] bg-rule" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score ?? undefined}>
        {score !== null && b && <div data-bar className={`h-full origin-left ${BAND_BG[b]}`} style={{ width: `${score}%` }} />}
        <span className="absolute -top-1 h-[11px] w-px bg-fg-3" style={{ left: "80%" }} aria-hidden />
      </div>
      {hint && <p className="mt-2 text-xs leading-snug text-fg-3">{hint}</p>}
    </div>
  );
}

/**
 * Mastery as contour rings: one ring per stage, like elevation on a map.
 * Readable without color: count the rings, or read the name.
 */
export function MasteryGlyph({ level, size = 28, due = false }: { level: MasteryLevel; size?: number; due?: boolean }) {
  const radii = [3.5, 7, 10.5, 14];
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} role="img" aria-label={`${MASTERY_NAMES[level]}, stage ${level} of 4${due ? ", due for review" : ""}`}>
      {radii.map((r, i) => (
        <circle
          key={r}
          cx="16"
          cy="16"
          r={r}
          fill={i === 0 && level > 0 ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={i < level ? 1.4 : 0.8}
          strokeDasharray={i < level ? undefined : "1 2.6"}
          opacity={i < level ? 1 : 0.35}
        />
      ))}
      {due && <circle cx="27" cy="5" r="3.2" fill="var(--signal)" />}
    </svg>
  );
}

export function MasteryTag({ level, due = false }: { level: MasteryLevel; due?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-fg">
      <MasteryGlyph level={level} size={22} due={due} />
      <span className="label !text-fg-2">{MASTERY_NAMES[level]}</span>
    </span>
  );
}

/** Signed change against the last take. Quiet by design: no arrows that shout, no red for a small dip. */
export function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return null;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className="font-mono text-xs text-fg-3">no change{suffix}</span>;
  return (
    <span className={`font-mono text-xs ${rounded > 0 ? "text-good" : "text-fg-2"}`}>
      {rounded > 0 ? "+" : "−"}
      {Math.abs(rounded)}
      {suffix}
    </span>
  );
}

/* ---------- formatters ---------- */

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const bare = (text: string): string => text.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
