"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { detectMode, MODE_LABEL, modeDescription } from "@/lib/mode";
import { useStore } from "@/lib/store";
import { useConfig } from "../ConfigContext";
import { Note } from "./ui";

const NAV = [
  { href: "/", label: "Today", match: (p: string) => p === "/" || p.startsWith("/session") || p.startsWith("/ear") },
  { href: "/speak", label: "Speak", match: (p: string) => p.startsWith("/speak") || p.startsWith("/talk") || p.startsWith("/shadow") },
  { href: "/scripts", label: "Scripts", match: (p: string) => p.startsWith("/scripts") || p.startsWith("/practice") || p.startsWith("/results") },
  { href: "/progress", label: "Progress", match: (p: string) => p.startsWith("/progress") || p.startsWith("/sound") || p.startsWith("/scan") || p.startsWith("/words") },
];

/** Speaking surfaces are dark so the script is the only bright thing in the room. */
const STAGE_ROUTES = ["/practice", "/session", "/ear", "/talk/conversation", "/talk/free", "/shadow", "/scan/run", "/words/review"];

export function ModeBadge() {
  const config = useConfig();
  const mode = detectMode(config);
  const detail = mode === "full" ? (config.anthropic ? "Azure + Claude" : "Azure + built-in coach") : "no phoneme scores";
  return (
    <span title={modeDescription(config)} className="label inline-flex items-center gap-2 text-fg-2">
      <span className={`h-1.5 w-1.5 rounded-full ${mode === "full" ? "bg-good" : "bg-fair"}`} aria-hidden />
      <span className="sr-only">Mode: </span>
      <span className="text-fg">{MODE_LABEL[mode]}</span>
      <span className="hidden text-fg-3 sm:inline">· {detail}</span>
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { storageError } = useStore();
  const stage = STAGE_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div data-theme={stage ? "stage" : "paper"} className="grain min-h-screen bg-bg text-fg transition-colors duration-500">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-10">
          <Link href="/" className="display text-[1.375rem] leading-none" aria-label="Speech Coach, home">
            <span className="display-italic">Speech</span> Coach
          </Link>
          <nav className="order-3 flex w-full gap-6 sm:order-none sm:w-auto sm:gap-7" aria-label="Main">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`label press relative py-2 ${active ? "text-fg" : "text-fg-3 hover:text-fg"}`}
                >
                  {item.label}
                  <span className={`absolute inset-x-0 -bottom-px h-px origin-left bg-fg transition-transform duration-300 ${active ? "scale-x-100" : "scale-x-0"}`} aria-hidden />
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <ModeBadge />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1680px] px-5 pb-28 pt-10 sm:px-10 sm:pt-14">
        {storageError && (
          <div className="mb-8">
            <Note tone="signal">{storageError}</Note>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
