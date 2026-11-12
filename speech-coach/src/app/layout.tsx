import type { Metadata } from "next";
import { DM_Mono, Fraunces, Gentium_Book_Plus, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ConfigProvider } from "@/components/ConfigContext";
import { Shell } from "@/components/ds/Shell";
import { getServerConfig } from "@/lib/server-config";
import "./globals.css";

// Display: Fraunces, a variable old-style serif with optical size, softness and "wonk" axes.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
// Text and interface.
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
// IPA specimens. Gentium is drawn for phonetics, so every symbol is a designed glyph, not a fallback.
const gentium = Gentium_Book_Plus({
  subsets: ["latin", "latin-ext", "greek"],
  weight: ["400", "700"],
  variable: "--font-gentium",
  display: "swap",
});
// Coordinates, labels, numbers on instruments.
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Speech Coach",
  description: "Rehearse work speech in English, see which sounds go wrong, and fix them one at a time.",
};

// Mode is detected from env on every request, so a key added to .env.local shows up after a restart.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable} ${gentium.variable} ${dmMono.variable}`}>
      <body>
        <ConfigProvider config={getServerConfig()}>
          <Shell>{children}</Shell>
        </ConfigProvider>
      </body>
    </html>
  );
}
