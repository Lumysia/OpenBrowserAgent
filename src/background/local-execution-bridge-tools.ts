import { errorMessage } from "../shared/error-message";
import { BRIDGE_ERROR } from "../shared/local-execution-bridge-protocol";
import {
  createLocalExecutionBridgeDraft,
  generateLocalExecutionBridgeSecret,
  isLocalExecutionBridgeTested,
  LOCAL_EXECUTION_BRIDGE_FALLBACK_NAME,
  localExecutionBridgeTestReset,
  normalizeLocalExecutionBridges,
  sameLocalExecutionBridgeConnection,
} from "../shared/local-execution-bridges";
import { LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE } from "../shared/local-execution-bridge-runtime";
import { respondWith, type RuntimeReply } from "../shared/runtime-messages";
import { removeById, storage, updateById } from "../shared/storage";
import type { LocalExecutionBridgeConfig } from "../shared/types";
import { trimmedString as text } from "../shared/values";
import { bridgeTaskCounts } from "./local-execution-bridge-tasks";
import { BridgeHostError, testLocalExecutionBridge } from "./bridge-connection";

type Bridge = LocalExecutionBridgeConfig;
type Input = Record<string, unknown>;

async function loadBridges() {
  return normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  );
}

const ACTIONS: Record<string, (input: Input) => Promise<Input>> = {
  list: listBridges,
  status: bridgeStatus,
  add: addBridge,
  update: updateBridge,
  test: (input) => testBridge(bridgeIdOf(input)),
  delete: deleteBridge,
};
export const LOCAL_BRIDGE_ACTIONS = Object.keys(ACTIONS);

export function runLocalBridgesAction(input: Input) {
  const action = text(input.action) || "list";
  return (
    ACTIONS[action]?.(input) ??
    Promise.resolve({
      success: false,
      error: "Unknown execution bridge action",
      action,
    })
  );
}

const bridgeIdOf = (input: Input) => text(input.bridgeId || input.id);

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

async function addBridge(input: Input) {
  const secret = text(input.secret);
  const fields: Partial<Bridge> = {};
  for (const key of EDITABLE)
    if (text(input[key])) fields[key] = text(input[key]);
  if (input.timeoutMs !== undefined) fields.timeoutMs = Number(input.timeoutMs);
  const [bridge] = normalizeLocalExecutionBridges([
    createLocalExecutionBridgeDraft(
      LOCAL_EXECUTION_BRIDGE_FALLBACK_NAME,
      fields,
    ),
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

async function updateBridge(input: Input) {
  const bridgeId = bridgeIdOf(input);
  if (!bridgeId)
    return { success: false, error: "Missing execution bridge ID" };
  const rotate = input.regenerateSecret === true;
  const patch: Partial<Bridge> = {};
  for (const key of EDITABLE)
    if (input[key] !== undefined) patch[key] = text(input[key]);
  if (input.timeoutMs !== undefined) patch.timeoutMs = Number(input.timeoutMs);
  if (rotate) patch.secret = generateLocalExecutionBridgeSecret();
  const updated = await updateById(
    storage.localExecutionBridges,
    bridgeId,
    (bridge) => ({
      ...bridge,
      ...patch,
      ...localExecutionBridgeTestReset(patch),
      updatedAt: Date.now(),
    }),
  );
  if (!updated) return { success: false, error: "Execution bridge not found" };
  return finish(bridgeId, input.test === true, rotate);
}

async function finish(bridgeId: string, test: boolean, showSecret: boolean) {
  const result: Input = test ? await testBridge(bridgeId) : { success: true };
  const bridge = (await loadBridges()).find((item) => item.id === bridgeId);
  return bridge
    ? { ...result, bridge: safeBridge(bridge, showSecret) }
    : result;
}

async function testBridge(bridgeId: string): Promise<Input> {
  if (!bridgeId)
    return { success: false, error: "Missing execution bridge ID" };
  const bridge = (await loadBridges()).find((item) => item.id === bridgeId);
  if (!bridge) return { success: false, error: "Execution bridge not found" };
  let result: Input;
  let lastTestError = "";
  try {
    result = { success: true, ping: await testLocalExecutionBridge(bridgeId) };
  } catch (error) {
    lastTestError = errorMessage(error);
    result = {
      success: false,
      error: lastTestError,
      ...diagnose(bridge, error),
    };
  }
  // Stored on the bridge as stored now, unless its connection changed
  // during the test.
  const tested = await updateById(
    storage.localExecutionBridges,
    bridgeId,
    (current) =>
      sameLocalExecutionBridgeConnection(current, bridge)
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

async function deleteBridge(input: Input) {
  const bridgeId = bridgeIdOf(input);
  const success = await removeById(storage.localExecutionBridges, bridgeId);
  return { success, bridgeId };
}

export function handleLocalExecutionBridgeRuntimeMessage(
  message: unknown,
  sendResponse: (reply: RuntimeReply) => void,
) {
  const request = (message || {}) as Record<string, unknown>;
  if (request.type !== LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE)
    return false;
  return respondWith(
    request.operation === "test"
      ? testLocalExecutionBridge(text(request.bridgeId))
      : Promise.reject(new Error("Unknown local execution bridge operation.")),
    sendResponse,
  );
}

function safeBridge(bridge: Bridge, includeSecret = false) {
  const tested = isLocalExecutionBridgeTested(bridge);
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
    ...(bridge.lastTestError
      ? { nextStep: "Test the bridge again to find out what to fix." }
      : {}),
    defaultCwd: bridge.defaultCwd,
    timeoutMs: bridge.timeoutMs,
    ...(includeSecret ? { secret: bridge.secret } : {}),
  };
}

// Chrome's text when the native host is not installed for this browser;
// it gives no code for it.
const HOST_MISSING = /not found|not registered/i;

// Turn a failed test into the one setup step that fixes it.
function diagnose(bridge: Bridge, error: unknown) {
  const code = error instanceof BridgeHostError ? error.code : undefined;
  if (code === BRIDGE_ERROR.unknownShellConfig)
    return {
      errorCode: "MISSING_SHELL_CONFIG",
      nextStep: `The native host is reachable but has no shell config "${bridge.bridgeKey || bridge.id}". Set bridgeKey to the command ID printed by the installer, then test again.`,
    };
  if (code === BRIDGE_ERROR.badSecret)
    return {
      errorCode: "SECRET_MISMATCH",
      nextStep:
        "Set this bridge's secret to the one printed by the installer (or rerun the installer with --secret), then test again.",
    };
  if (
    !(error instanceof BridgeHostError) &&
    HOST_MISSING.test(errorMessage(error))
  )
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
