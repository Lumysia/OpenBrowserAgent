import { bytesToHex } from "./binary";
import { LOCAL_EXECUTION_BRIDGE_LIMITS } from "./config";
import type { LocalExecutionBridgeConfig } from "./types";

// The native host name the bridge installer registers
// (packages/local-execution-bridge, HOST_NAME).
export const LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME =
  "openbrowseragent.local_execution_bridge";
// The shell config ID the installer uses when none is given.
export const LOCAL_EXECUTION_BRIDGE_DEFAULT_KEY = "default";

// Stored for a bridge saved without a name; the settings show it in the UI
// language.
export const LOCAL_EXECUTION_BRIDGE_FALLBACK_NAME = "Execution Bridge";

const SECRET_BYTES = 32;

// Fields that decide whether the bridge reaches the host; changing any of
// them makes the last test result stale.
export const LOCAL_EXECUTION_BRIDGE_CONNECTION_KEYS = [
  "hostName",
  "hostAddress",
  "bridgeKey",
  "secret",
] as const;

export function generateLocalExecutionBridgeSecret() {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function createLocalExecutionBridgeDraft(
  name: string,
  fields: Partial<LocalExecutionBridgeConfig> = {},
): LocalExecutionBridgeConfig {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    hostName: LOCAL_EXECUTION_BRIDGE_DEFAULT_HOST_NAME,
    hostAddress: "",
    secret: generateLocalExecutionBridgeSecret(),
    bridgeKey: "",
    defaultCwd: "",
    timeoutMs: LOCAL_EXECUTION_BRIDGE_LIMITS.defaultTimeoutMs,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

export function normalizeLocalExecutionBridges(
  value: LocalExecutionBridgeConfig[] | undefined,
): LocalExecutionBridgeConfig[] {
  return (Array.isArray(value) ? value : [])
    .filter(isLocalExecutionBridgeLike)
    .map((bridge) => ({
      ...bridge,
      name: bridge.name.trim() || LOCAL_EXECUTION_BRIDGE_FALLBACK_NAME,
      description: bridge.description || "",
      hostName: bridge.hostName.trim(),
      hostAddress: bridge.hostAddress?.trim() || "",
      secret: bridge.secret?.trim() || generateLocalExecutionBridgeSecret(),
      bridgeKey: bridge.bridgeKey?.trim() || "",
      defaultCwd: bridge.defaultCwd?.trim() || "",
      timeoutMs: clampLocalExecutionBridgeTimeout(bridge.timeoutMs),
      lastTestedAt: bridge.lastTestedAt,
      lastTestError: bridge.lastTestError || "",
      createdAt: bridge.createdAt || 0,
      updatedAt: bridge.updatedAt || bridge.createdAt || 0,
    }));
}

export function resolveLocalExecutionBridge(
  value: LocalExecutionBridgeConfig[] | undefined,
  bridgeId?: string,
  bridgeName?: string,
) {
  const bridges = normalizeLocalExecutionBridges(value).filter(
    (bridge) => bridge.hostName,
  );
  const name = bridgeName?.trim().toLowerCase();
  return (
    bridges.find((bridge) => bridge.id === bridgeId) ||
    (name
      ? bridges.find((bridge) => bridge.name.toLowerCase() === name)
      : null) ||
    bridges[0]
  );
}

export function clampLocalExecutionBridgeTimeout(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    return LOCAL_EXECUTION_BRIDGE_LIMITS.defaultTimeoutMs;
  return Math.min(
    LOCAL_EXECUTION_BRIDGE_LIMITS.maxTimeoutMs,
    Math.max(LOCAL_EXECUTION_BRIDGE_LIMITS.minTimeoutMs, Math.trunc(number)),
  );
}

// The timeout one command runs with: the one asked for, else the bridge's.
export function localExecutionBridgeCommandTimeout(
  bridge: Pick<LocalExecutionBridgeConfig, "timeoutMs">,
  requested?: unknown,
) {
  const number = Number(requested);
  return clampLocalExecutionBridgeTimeout(
    Number.isFinite(number) && number > 0 ? number : bridge.timeoutMs,
  );
}

export function isLocalExecutionBridgeTested(
  bridge: Pick<LocalExecutionBridgeConfig, "lastTestedAt" | "lastTestError">,
) {
  return !!bridge.lastTestedAt && !bridge.lastTestError;
}

export function sameLocalExecutionBridgeConnection(
  left: LocalExecutionBridgeConfig,
  right: LocalExecutionBridgeConfig,
) {
  return LOCAL_EXECUTION_BRIDGE_CONNECTION_KEYS.every(
    (key) => left[key] === right[key],
  );
}

// The fields to clear with `patch` so a changed connection is tested again.
export function localExecutionBridgeTestReset(
  patch: Partial<LocalExecutionBridgeConfig>,
): Partial<LocalExecutionBridgeConfig> {
  return LOCAL_EXECUTION_BRIDGE_CONNECTION_KEYS.some((key) => key in patch)
    ? { lastTestedAt: undefined, lastTestError: "" }
    : {};
}

function isLocalExecutionBridgeLike(
  value: LocalExecutionBridgeConfig | undefined,
) {
  return (
    !!value?.id &&
    typeof value.name === "string" &&
    typeof value.hostName === "string"
  );
}
