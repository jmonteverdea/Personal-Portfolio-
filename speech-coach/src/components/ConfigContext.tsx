"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppConfig } from "@/lib/types";

const ConfigContext = createContext<AppConfig>({ azure: false, anthropic: false });

export function ConfigProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

/** Which server keys exist. Booleans only: the keys themselves never reach the browser. */
export function useConfig(): AppConfig {
  return useContext(ConfigContext);
}
