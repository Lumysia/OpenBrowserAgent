import type { LocalExecutionBridgeConfig } from "./types";

export const LOCAL_EXECUTION_BRIDGE_DEFAULT_TIMEOUT_MS = 120_000;
export const LOCAL_EXECUTION_BRIDGE_MAX_TIMEOUT_MS = 30 * 60_000;

export const DEFAULT_LOCAL_EXECUTION_BRIDGES: LocalExecutionBridgeConfig[] = [];

export function generateLocalExecutionBridgeSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function createLocalExecutionBridgeDraft(
  name: string,
): LocalExecutionBridgeConfig {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    hostName: "openbrowseragent.local_execution_bridge",
    hostAddress: "",
    secret: generateLocalExecutionBridgeSecret(),
    bridgeKey: "",
    defaultCwd: "",
    timeoutMs: LOCAL_EXECUTION_BRIDGE_DEFAULT_TIMEOUT_MS,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeLocalExecutionBridges(
  value: LocalExecutionBridgeConfig[] | undefined,
): LocalExecutionBridgeConfig[] {
  const now = Date.now();
  return (Array.isArray(value) ? value : [])
    .filter(isLocalExecutionBridgeLike)
    .map((bridge) => {
      const rest = {
        ...(bridge as LocalExecutionBridgeConfig & { enabled?: boolean }),
      };
      delete rest.enabled;
      return {
        ...rest,
        name: bridge.name.trim() || "Execution Bridge",
        description: bridge.description || "",
        hostName: bridge.hostName.trim(),
        hostAddress: bridge.hostAddress?.trim() || "",
        secret: bridge.secret?.trim() || generateLocalExecutionBridgeSecret(),
        bridgeKey: bridge.bridgeKey?.trim() || "",
        defaultCwd: bridge.defaultCwd?.trim() || "",
        timeoutMs: clampLocalExecutionBridgeTimeout(bridge.timeoutMs),
        lastTestedAt: bridge.lastTestedAt,
        lastTestError: bridge.lastTestError || "",
        createdAt: bridge.createdAt || now,
        updatedAt: bridge.updatedAt || bridge.createdAt || now,
      };
    });
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
  if (!Number.isFinite(number))
    return LOCAL_EXECUTION_BRIDGE_DEFAULT_TIMEOUT_MS;
  return Math.min(
    LOCAL_EXECUTION_BRIDGE_MAX_TIMEOUT_MS,
    Math.max(1_000, Math.trunc(number)),
  );
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
