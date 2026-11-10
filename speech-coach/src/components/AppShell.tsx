"use client";

import { AudioLines } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { detectMode, MODE_LABEL, modeDescription } from "@/lib/mode";
import { useStore } from "@/lib/store";
import { useConfig } from "./ConfigContext";
import { Notice } from "./ui";

const NAV = [
  { href: "/", label: "Scripts" },
  { href: "/history", label: "Progress" },
];

export function ModeBadge() {
  const config = useConfig();
  const mode = detectMode(config);
  const style = mode === "full" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <span
      title={modeDescription(config)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${mode === "full" ? "bg-emerald-600" : "bg-amber-600"}`} aria-hidden />
      <span className="sr-only">Mode: </span>
      {MODE_LABEL[mode]}
      {mode === "full" && !config.anthropic && <span className="font-normal opacity-80">· coaching off</span>}
      {mode === "transcript" && <span className="font-normal opacity-80">· no phoneme scores</span>}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { storageError } = useStore();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <AudioLines className="h-5 w-5 text-accent" aria-hidden />
            Speech Coach
          </Link>
          <nav className="flex gap-1" aria-label="Main">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-white text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <ModeBadge />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {storageError && (
          <div className="mb-6">
            <Notice tone="warn" title="Not saved">{storageError}</Notice>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
