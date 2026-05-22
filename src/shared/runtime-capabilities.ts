import type { AgentCapabilities } from "./types";

export const CDP_AGENT_CAPABILITY_KEYS = [
  "deferredBrowserTools",
  "cdpTools",
  "javascriptExecution",
] as const satisfies ReadonlyArray<keyof AgentCapabilities>;

export function areCdpToolsAvailable() {
  return !!(globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
    ?.debugger;
}
