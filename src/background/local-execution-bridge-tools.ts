import {
  generateLocalExecutionBridgeSecret,
  normalizeLocalExecutionBridges,
} from "../shared/local-execution-bridges";
import {
  LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE,
  type LocalExecutionBridgeRuntimeResponse,
} from "../shared/local-execution-bridge-runtime";
import { removeById, storage, updateById } from "../shared/storage";
import type { LocalExecutionBridgeConfig } from "../shared/types";
import { bridgeTaskCounts } from "./local-execution-bridge-tasks";
import { testLocalExecutionBridge } from "./bridge-connection";

type Bridge = LocalExecutionBridgeConfig;

async function loadBridges() {
  return normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  );
}

export function runLocalBridgesAction(input: Record<string, unknown>) {
  const action = text(input.action || "list");
  if (action === "list") return listBridges();
  if (action === "status") return bridgeStatus();
  if (action === "add") return addBridge(input);
  if (action === "update") return updateBridge(input);
  if (action === "test") return testBridge(text(input.bridgeId || input.id));
  if (action === "delete") return deleteBridge(input);
  return {
    success: false,
    error: "Unknown execution bridge action",
    action,
  };
}

async function listBridges() {
  return { bridges: (await loadBridges()).map((bridge) => safeBridge(bridge)) };
}

async function bridgeStatus() {
  const bridges = (await loadBridges()).map((bridge) => safeBridge(bridge));
  const usable = bridges.filter((bridge) => bridge.usable).length;
  return {
    success: true,
    configured: bridges.length > 0,
    bridgeCount: bridges.length,
    usable: usable > 0,
    usableBridgeCount: usable,
    bridges,
    ...bridgeTaskCounts(),
    guidance: bridges.length
      ? "Use action test with a bridgeId to verify native messaging connectivity, or localCommand to run a command."
      : "No local execution bridge is configured. Add one before trying to run local commands.",
  };
}

async function addBridge(input: Record<string, unknown>) {
  const now = Date.now();
  const secret = text(input.secret);
  const [bridge] = normalizeLocalExecutionBridges([
    {
      id: crypto.randomUUID(),
      name: text(input.name) || "Execution Bridge",
      description: text(input.description),
      hostName:
        text(input.hostName) || "openbrowseragent.local_execution_bridge",
      hostAddress: text(input.hostAddress),
      secret: secret || generateLocalExecutionBridgeSecret(),
      bridgeKey: text(input.bridgeKey),
      defaultCwd: text(input.defaultCwd),
      timeoutMs: input.timeoutMs as number | undefined,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await storage.localExecutionBridges.update((bridges) => [...bridges, bridge]);
  // A generated secret is shown once so the user can copy it to the host.
  return finish(bridge.id, input.test === true, !secret);
}

const EDITABLE = [
  "name",
  "description",
  "hostName",
  "hostAddress",
  "bridgeKey",
  "defaultCwd",
  "secret",
] as const;
const CONNECTION_KEYS = [
  "hostName",
  "hostAddress",
  "bridgeKey",
  "secret",
] as const;
const CONNECTION = new Set<string>(CONNECTION_KEYS);

async function updateBridge(input: Record<string, unknown>) {
  const bridgeId = text(input.bridgeId || input.id);
  if (!bridgeId)
    return { success: false, error: "Missing execution bridge ID" };
  const rotate = input.regenerateSecret === true;
  const patch: Partial<Bridge> = { updatedAt: Date.now() };
  for (const key of EDITABLE)
    if (input[key] !== undefined) patch[key] = text(input[key]);
  if (input.timeoutMs !== undefined) patch.timeoutMs = Number(input.timeoutMs);
  if (rotate) patch.secret = generateLocalExecutionBridgeSecret();
  // A changed connection invalidates the previous test result.
  if (rotate || EDITABLE.some((key) => CONNECTION.has(key) && key in patch))
    Object.assign(patch, { lastTestedAt: undefined, lastTestError: "" });
  const updated = await updateById(
    storage.localExecutionBridges,
    bridgeId,
    (bridge) => ({ ...bridge, ...patch }),
  );
  if (!updated) return { success: false, error: "Execution bridge not found" };
  return finish(bridgeId, input.test === true, rotate);
}

async function finish(bridgeId: string, test: boolean, showSecret: boolean) {
  const result: Record<string, unknown> = test
    ? await testBridge(bridgeId)
    : { success: true };
  const bridge = (await loadBridges()).find((item) => item.id === bridgeId);
  return bridge
    ? { ...result, bridge: safeBridge(bridge, showSecret) }
    : result;
}

async function testBridge(bridgeId: string): Promise<Record<string, unknown>> {
  if (!bridgeId)
    return { success: false, error: "Missing execution bridge ID" };
  const bridge = (await loadBridges()).find((item) => item.id === bridgeId);
  if (!bridge) return { success: false, error: "Execution bridge not found" };
  let result: Record<string, unknown>;
  let lastTestError = "";
  try {
    result = { success: true, ping: await testLocalExecutionBridge(bridgeId) };
  } catch (error) {
    lastTestError = error instanceof Error ? error.message : String(error);
    result = {
      success: false,
      error: lastTestError,
      ...diagnose(bridge, lastTestError),
    };
  }
  // Stored on the bridge as stored now, unless its connection changed
  // during the test.
  const tested = await updateById(
    storage.localExecutionBridges,
    bridgeId,
    (current) =>
      sameConnection(current, bridge)
        ? {
            ...current,
            lastTestedAt: lastTestError ? undefined : Date.now(),
            lastTestError,
            updatedAt: Date.now(),
          }
        : current,
  );
  if (!tested) return { success: false, error: "Execution bridge not found" };
  return { ...result, bridge: safeBridge(tested) };
}

const sameConnection = (left: Bridge, right: Bridge) =>
  CONNECTION_KEYS.every((key) => left[key] === right[key]);

async function deleteBridge(input: Record<string, unknown>) {
  const bridgeId = text(input.bridgeId || input.id);
  const success = await removeById(storage.localExecutionBridges, bridgeId);
  return { success, bridgeId };
}

export function handleLocalExecutionBridgeRuntimeMessage(
  message: unknown,
  sendResponse: (response: LocalExecutionBridgeRuntimeResponse) => void,
) {
  const request = (message || {}) as Record<string, unknown>;
  if (request.type !== LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE)
    return false;
  const promise =
    request.operation === "test"
      ? testLocalExecutionBridge(text(request.bridgeId))
      : Promise.reject(new Error("Unknown local execution bridge operation."));
  promise
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}

function safeBridge(bridge: Bridge, includeSecret = false) {
  const tested = !!bridge.lastTestedAt && !bridge.lastTestError;
  return {
    id: bridge.id,
    name: bridge.name,
    description: bridge.description,
    hostName: bridge.hostName,
    hostAddress: bridge.hostAddress,
    bridgeKey: bridge.bridgeKey,
    tested,
    usable: !!bridge.hostName && tested,
    lastTestError: bridge.lastTestError || "",
    ...(bridge.lastTestError ? diagnose(bridge, bridge.lastTestError) : {}),
    defaultCwd: bridge.defaultCwd,
    timeoutMs: bridge.timeoutMs,
    ...(includeSecret ? { secret: bridge.secret } : {}),
  };
}

// Turn a native host error into the one setup step that fixes it.
function diagnose(bridge: Bridge, error: string) {
  const message = error.toLowerCase();
  if (message.includes("unknown shell config"))
    return {
      errorCode: "MISSING_SHELL_CONFIG",
      nextStep: `The native host is reachable but has no shell config "${bridge.bridgeKey || bridge.id}". Set bridgeKey to the command ID printed by the installer, then test again.`,
    };
  if (message.includes("secret"))
    return {
      errorCode: "SECRET_MISMATCH",
      nextStep:
        "Set this bridge's secret to the one printed by the installer (or rerun the installer with --secret), then test again.",
    };
  if (message.includes("not found") || message.includes("not registered"))
    return {
      errorCode: "NATIVE_HOST_NOT_FOUND",
      nextStep:
        "Run the local execution bridge installer for this browser and extension ID, fully restart the browser, then test again.",
    };
  return {
    errorCode: "BRIDGE_TEST_FAILED",
    nextStep: "Review the local execution bridge setup, then test again.",
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
