import {
  generateLocalExecutionBridgeSecret,
  normalizeLocalExecutionBridges,
  resolveLocalExecutionBridge,
} from "../shared/local-execution-bridges";
import {
  LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE,
  type LocalExecutionBridgeRuntimeResponse,
} from "../shared/local-execution-bridge-runtime";
import { storage } from "../shared/storage";
import type {
  AgentWorkspace,
  LocalExecutionBridgeConfig,
} from "../shared/types";

const LOCAL_EXECUTION_BRIDGE_EVENT_LIMIT = 80;

type LocalExecutionBridgeState =
  | "running"
  | "done"
  | "error"
  | "missing"
  | "canceled";

type LocalExecutionBridgeTask = {
  taskId: string;
  bridge: Pick<
    LocalExecutionBridgeConfig,
    "id" | "name" | "hostName" | "hostAddress" | "bridgeKey"
  >;
  state: LocalExecutionBridgeState;
  output: string;
  result?: unknown;
  error?: string;
  events: Array<Record<string, unknown>>;
  startedAt: number;
  updatedAt: number;
  port?: chrome.runtime.Port;
};

type LocalExecutionBridgePing = {
  success: true;
  shell?: string;
  shellArgsPreview?: string[];
  platform?: string;
  cwd?: string;
  node?: string;
  env?: Record<string, unknown>;
  localCli?: Array<Record<string, unknown>>;
};

const tasks = new Map<string, LocalExecutionBridgeTask>();

export async function listLocalExecutionBridges() {
  const bridges = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  );
  return {
    bridges: bridges.map((bridge) => safeLocalExecutionBridge(bridge)),
  };
}

export async function addLocalExecutionBridge(input: Record<string, unknown>) {
  const now = Date.now();
  const inputSecret = stringValue(input.secret);
  const generatedSecret = inputSecret
    ? ""
    : generateLocalExecutionBridgeSecret();
  const bridge = normalizeLocalExecutionBridges([
    {
      id: crypto.randomUUID(),
      name: stringValue(input.name) || "Execution Bridge",
      description: stringValue(input.description),
      hostName:
        stringValue(input.hostName) ||
        "openbrowseragent.local_execution_bridge",
      hostAddress: stringValue(input.hostAddress),
      secret: inputSecret || generatedSecret,
      bridgeKey: stringValue(input.bridgeKey),
      defaultCwd: stringValue(input.defaultCwd),
      timeoutMs: input.timeoutMs as number | undefined,
      createdAt: now,
      updatedAt: now,
    },
  ])[0];
  await storage.localExecutionBridges.set([
    ...(await storage.localExecutionBridges.get()),
    bridge,
  ]);
  if (input.test === true) {
    const tested = await testLocalExecutionBridgeConfig({
      bridgeId: bridge.id,
    });
    return includeSecretResult(tested, bridge.id, !inputSecret);
  }
  return {
    success: true,
    bridge: safeLocalExecutionBridge(bridge, !inputSecret),
  };
}

export async function updateLocalExecutionBridge(
  input: Record<string, unknown>,
): Promise<unknown> {
  const bridgeId = stringValue(input.bridgeId || input.id);
  if (!bridgeId)
    return { success: false, error: "Missing execution bridge ID" };
  let updated: LocalExecutionBridgeConfig | undefined;
  const rotateSecret = input.regenerateSecret === true;
  await storage.localExecutionBridges.set(
    normalizeLocalExecutionBridges(
      await storage.localExecutionBridges.get(),
    ).map((bridge) => {
      if (bridge.id !== bridgeId) return bridge;
      const patch: Partial<LocalExecutionBridgeConfig> = {
        ...(input.name !== undefined ? { name: stringValue(input.name) } : {}),
        ...(input.description !== undefined
          ? { description: stringValue(input.description) }
          : {}),
        ...(input.hostName !== undefined
          ? { hostName: stringValue(input.hostName) }
          : {}),
        ...(input.hostAddress !== undefined
          ? { hostAddress: stringValue(input.hostAddress) }
          : {}),
        ...(input.bridgeKey !== undefined
          ? { bridgeKey: stringValue(input.bridgeKey) }
          : {}),
        ...(input.defaultCwd !== undefined
          ? { defaultCwd: stringValue(input.defaultCwd) }
          : {}),
        ...(input.timeoutMs !== undefined
          ? { timeoutMs: Number(input.timeoutMs) }
          : {}),
        ...(input.secret !== undefined
          ? { secret: stringValue(input.secret) }
          : {}),
        ...(rotateSecret
          ? { secret: generateLocalExecutionBridgeSecret() }
          : {}),
        updatedAt: Date.now(),
      };
      const needsRetest =
        input.hostName !== undefined ||
        input.hostAddress !== undefined ||
        input.bridgeKey !== undefined ||
        input.secret !== undefined ||
        rotateSecret;
      updated = normalizeLocalExecutionBridges([
        {
          ...bridge,
          ...patch,
          ...(needsRetest
            ? { lastTestedAt: undefined, lastTestError: "" }
            : {}),
        },
      ])[0];
      return updated;
    }),
  );
  if (!updated) return { success: false, error: "Execution bridge not found" };
  if (input.test === true) {
    const tested = await testLocalExecutionBridgeConfig({ bridgeId });
    return includeSecretResult(tested, bridgeId, rotateSecret);
  }
  return {
    success: true,
    bridge: safeLocalExecutionBridge(updated, rotateSecret),
  };
}

export async function testLocalExecutionBridgeConfig(
  input: Record<string, unknown>,
) {
  const bridgeId = stringValue(input.bridgeId || input.id);
  if (!bridgeId)
    return { success: false, error: "Missing execution bridge ID" };
  let result: Record<string, unknown> | undefined;
  let testError = "";
  const bridges = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  );
  await storage.localExecutionBridges.set(
    await Promise.all(
      bridges.map(async (bridge) => {
        if (bridge.id !== bridgeId) return bridge;
        try {
          const diagnostic = await testLocalExecutionBridge(bridge.id);
          const next = {
            ...bridge,
            lastTestedAt: Date.now(),
            lastTestError: "",
            updatedAt: Date.now(),
          };
          result = { ...safeLocalExecutionBridge(next), diagnostic };
          return next;
        } catch (error) {
          testError = errorMessage(error);
          const next = {
            ...bridge,
            lastTestedAt: undefined,
            lastTestError: testError,
            updatedAt: Date.now(),
          };
          result = safeLocalExecutionBridge(next);
          return next;
        }
      }),
    ),
  );
  if (!result) return { success: false, error: "Execution bridge not found" };
  return testError
    ? {
        success: false,
        error: testError,
        diagnostic: diagnoseLocalExecutionBridgeError(testError),
        bridge: result,
      }
    : { success: true, bridge: result };
}

export async function deleteLocalExecutionBridge(
  input: Record<string, unknown>,
) {
  const bridgeId = stringValue(input.bridgeId || input.id);
  const bridges = await storage.localExecutionBridges.get();
  const next = bridges.filter((bridge) => bridge.id !== bridgeId);
  await storage.localExecutionBridges.set(next);
  return { success: next.length !== bridges.length, bridgeId };
}

export async function startLocalExecutionBridge(
  input: Record<string, unknown>,
  context?: { chatId?: string; messageId?: string; toolCallId?: string },
  workspace?: AgentWorkspace,
) {
  const bridges = await storage.localExecutionBridges.get();
  const bridge = resolveLocalExecutionBridge(
    bridges,
    stringValue(input.bridgeId),
    stringValue(input.bridgeName),
  );
  if (!bridge)
    return {
      success: false,
      error: "No local execution bridge is configured.",
      state: "missing",
    };
  const commandLine =
    stringValue(input.command) ||
    stringValue(input.shellCommand) ||
    stringValue(input.task) ||
    stringValue(input.prompt);
  if (!commandLine)
    return {
      success: false,
      error: "Shell command is required.",
      state: "missing",
    };

  const task = createTask(bridge);
  tasks.set(task.taskId, task);
  try {
    await testLocalExecutionBridge(bridge.id);
    await markLocalExecutionBridgeTested(bridge.id, "");
    task.port = chrome.runtime.connectNative(bridge.hostName);
    task.port.onMessage.addListener((message) =>
      receiveBridgeMessage(task, message),
    );
    task.port.onDisconnect.addListener(() => finishDisconnectedTask(task));
    task.port.postMessage({
      type: "command.run",
      taskId: task.taskId,
      command: {
        id: bridge.id,
        key: bridge.bridgeKey || bridge.id,
        name: bridge.name,
        hostAddress: bridge.hostAddress || "",
        secret: bridge.secret || "",
      },
      commandLine,
      shell: stringValue(input.shell),
      title: stringValue(input.title),
      cwd: stringValue(input.cwd) || bridge.defaultCwd || "",
      context: {
        ...context,
        workspaceFiles: workspace?.files?.map((file) => ({
          path: file.path,
          kind: file.kind,
          content: file.content,
        })),
        inputContext: input.context,
      },
      timeoutMs: input.timeoutMs || bridge.timeoutMs,
    });
  } catch (error) {
    task.state = "error";
    task.error = errorMessage(error);
    task.updatedAt = Date.now();
    await markLocalExecutionBridgeTested(bridge.id, task.error);
  }

  return taskStatus(task.taskId);
}

export async function getLocalExecutionBridgeStatus(
  input: Record<string, unknown>,
) {
  const taskId = stringValue(input.taskId);
  const wait = input.wait === true;
  const timeoutMs = clampStatusTimeout(input.timeoutMs);
  if (wait) await waitForLocalExecutionBridge(taskId, timeoutMs);
  return taskStatus(taskId);
}

export async function cancelLocalExecutionBridge(
  input: Record<string, unknown>,
) {
  const taskId = stringValue(input.taskId);
  const task = tasks.get(taskId);
  if (!task) return { success: false, state: "missing", taskId };
  if (task.state === "running") {
    task.port?.postMessage({ type: "command.cancel", taskId });
    task.port?.disconnect();
    task.state = "canceled";
    task.updatedAt = Date.now();
  }
  return taskStatus(taskId);
}

export async function testLocalExecutionBridge(bridgeId: string) {
  const bridge = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  ).find((item) => item.id === bridgeId);
  if (!bridge) throw new Error("Local execution bridge not found.");
  if (!bridge.hostName) throw new Error("Native host name is required.");
  const port = chrome.runtime.connectNative(bridge.hostName);
  return new Promise<LocalExecutionBridgePing>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      port.disconnect();
      reject(new Error("Local execution bridge test timed out."));
    }, 5_000);
    port.onMessage.addListener((message) => {
      if (settled) return;
      const object = objectValue(message);
      if (object.type === "command.error" || object.type === "error") {
        settled = true;
        clearTimeout(timer);
        port.disconnect();
        reject(new Error(stringValue(object.error) || "Bridge test failed."));
        return;
      }
      if (object.type !== "command.pong" && object.type !== "pong") return;
      settled = true;
      clearTimeout(timer);
      port.disconnect();
      resolve({
        success: true,
        shell: stringValue(object.shell),
        shellArgsPreview: Array.isArray(object.shellArgsPreview)
          ? object.shellArgsPreview.map(String)
          : undefined,
        platform: stringValue(object.platform),
        cwd: stringValue(object.cwd),
        node: stringValue(object.node),
        env: objectValue(object.env),
        localCli: Array.isArray(object.localCli)
          ? object.localCli.map(objectValue)
          : undefined,
      });
    });
    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(chrome.runtime.lastError?.message || "Disconnected."));
    });
    port.postMessage({
      type: "command.ping",
      command: {
        id: bridge.id,
        key: bridge.bridgeKey || bridge.id,
        name: bridge.name,
        hostAddress: bridge.hostAddress || "",
        secret: bridge.secret || "",
      },
    });
  });
}

export function handleLocalExecutionBridgeRuntimeMessage(
  message: unknown,
  sendResponse: (response: LocalExecutionBridgeRuntimeResponse) => void,
) {
  const request = objectValue(message);
  if (request.type !== LOCAL_EXECUTION_BRIDGE_RUNTIME_MESSAGE_TYPE)
    return false;
  const operation = stringValue(request.operation);
  const promise =
    operation === "test"
      ? testLocalExecutionBridge(stringValue(request.bridgeId))
      : Promise.reject(new Error("Unknown local execution bridge operation."));
  promise
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
}

function createTask(
  bridge: LocalExecutionBridgeConfig,
): LocalExecutionBridgeTask {
  const now = Date.now();
  return {
    taskId: crypto.randomUUID(),
    bridge: {
      id: bridge.id,
      name: bridge.name,
      hostName: bridge.hostName,
      hostAddress: bridge.hostAddress,
      bridgeKey: bridge.bridgeKey,
    },
    state: "running",
    output: "",
    events: [],
    startedAt: now,
    updatedAt: now,
  };
}

function receiveBridgeMessage(
  task: LocalExecutionBridgeTask,
  message: unknown,
) {
  const event = objectValue(message);
  task.updatedAt = Date.now();
  pushEvent(task, event);
  const text = stringValue(event.data) || stringValue(event.text);
  if (
    text &&
    ["stdout", "stderr", "message_delta", "text"].includes(
      stringValue(event.event) || stringValue(event.type),
    )
  ) {
    task.output += text;
  }
  if (event.result !== undefined) task.result = event.result;
  if (event.error !== undefined) task.error = stringValue(event.error);
  const type = stringValue(event.type) || stringValue(event.event);
  if (type === "command.error" || type === "error") task.state = "error";
  if (type === "command.done" || type === "done")
    task.state = task.error ? "error" : "done";
}

function finishDisconnectedTask(task: LocalExecutionBridgeTask) {
  if (task.state !== "running") return;
  const error = chrome.runtime.lastError?.message;
  task.state = error ? "error" : "done";
  task.error = error || task.error;
  task.updatedAt = Date.now();
}

async function waitForLocalExecutionBridge(taskId: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = tasks.get(taskId);
    if (!task || task.state !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function taskStatus(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return { success: false, state: "missing", taskId };
  return {
    success: task.state !== "error",
    taskId,
    state: task.state,
    bridge: task.bridge,
    output: task.output,
    result: task.result,
    ...(task.error ? { error: task.error } : {}),
    progress: task.events.slice(-8),
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  };
}

function safeLocalExecutionBridge(
  bridge: LocalExecutionBridgeConfig,
  includeSecret = false,
) {
  return {
    id: bridge.id,
    name: bridge.name,
    description: bridge.description,
    hostName: bridge.hostName,
    hostAddress: bridge.hostAddress,
    bridgeKey: bridge.bridgeKey,
    tested: isLocalExecutionBridgeTested(bridge),
    lastTestError: bridge.lastTestError || "",
    defaultCwd: bridge.defaultCwd,
    timeoutMs: bridge.timeoutMs,
    ...(includeSecret ? { secret: bridge.secret } : {}),
  };
}

async function markLocalExecutionBridgeTested(bridgeId: string, error: string) {
  const now = Date.now();
  await storage.localExecutionBridges.set(
    normalizeLocalExecutionBridges(
      await storage.localExecutionBridges.get(),
    ).map((bridge) =>
      bridge.id === bridgeId
        ? {
            ...bridge,
            lastTestedAt: error ? undefined : now,
            lastTestError: error,
            updatedAt: now,
          }
        : bridge,
    ),
  );
}

async function includeSecretResult(
  result: unknown,
  bridgeId: string,
  includeSecret: boolean,
) {
  if (!includeSecret) return result;
  const bridge = normalizeLocalExecutionBridges(
    await storage.localExecutionBridges.get(),
  ).find((item) => item.id === bridgeId);
  if (!bridge || !result || typeof result !== "object") return result;
  return { ...result, bridge: safeLocalExecutionBridge(bridge, true) };
}

function isLocalExecutionBridgeTested(bridge: LocalExecutionBridgeConfig) {
  return !!bridge.lastTestedAt && !bridge.lastTestError;
}

function pushEvent(
  task: LocalExecutionBridgeTask,
  event: Record<string, unknown>,
) {
  task.events.push(event);
  if (task.events.length > LOCAL_EXECUTION_BRIDGE_EVENT_LIMIT)
    task.events.splice(
      0,
      task.events.length - LOCAL_EXECUTION_BRIDGE_EVENT_LIMIT,
    );
}

function clampStatusTimeout(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 60_000;
  return Math.min(30 * 60_000, Math.max(0, Math.trunc(number)));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function diagnoseLocalExecutionBridgeError(error: string) {
  const normalized = error.toLowerCase();
  if (
    normalized.includes("native messaging host not found") ||
    normalized.includes("specified native messaging host not found") ||
    normalized.includes("not registered")
  ) {
    return {
      reason:
        "The browser cannot find the Native Messaging host registration for this extension.",
      nextSteps: [
        "Run the local execution bridge installer for the exact browser and extension ID.",
        "For Brave, Vivaldi, or Chromium on Windows, reinstall with the latest bridge package because those browsers may read Chrome-compatible Native Messaging registry keys.",
        "Fully restart the browser after installing the host, then test again.",
      ],
    };
  }
  if (normalized.includes("secret")) {
    return {
      reason:
        "The extension-side bridge secret does not match the native bridge shell config.",
      nextSteps: [
        "Use the secret printed by the installer output.",
        "If the secret was rotated, update the extension-side bridge config before testing again.",
      ],
    };
  }
  return undefined;
}
