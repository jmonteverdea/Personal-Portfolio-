import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfigProvider } from "@/components/ConfigContext";
import { getServerConfig } from "@/lib/server-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speech Coach",
  description: "Rehearse work speech in English, see which sounds go wrong, and get specific coaching.",
};

// Mode is detected from env on every request, so a key added to .env.local shows up after a restart.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConfigProvider config={getServerConfig()}>
          <AppShell>{children}</AppShell>
        </ConfigProvider>
      </body>
    </html>
  );
}
