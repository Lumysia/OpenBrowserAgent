import { delay } from "../shared/cancellation";
import { resolveLocalExecutionBridge } from "../shared/local-execution-bridges";
import { storage } from "../shared/storage";
import type {
  AgentWorkspace,
  LocalExecutionBridgeConfig,
} from "../shared/types";
import {
  testLocalExecutionBridge,
  markLocalExecutionBridgeTested,
} from "./bridge-connection";

type Task = {
  taskId: string;
  bridge: Pick<
    LocalExecutionBridgeConfig,
    "id" | "name" | "hostName" | "hostAddress" | "bridgeKey"
  >;
  state: "running" | "done" | "error" | "canceled";
  output: string;
  error?: string;
  result?: unknown;
  events: Record<string, unknown>[];
  startedAt: number;
  updatedAt: number;
  port?: chrome.runtime.Port;
  canceling?: Promise<void>;
  finish?: () => void;
  cleanup?: () => void;
};
const tasks = new Map<string, Task>();
const EVENT_LIMIT = 80;
const CANCEL_ACK_TIMEOUT = 5_000;

export function bridgeTaskCounts() {
  const taskStates: Record<string, number> = {};
  for (const task of tasks.values())
    taskStates[task.state] = (taskStates[task.state] || 0) + 1;
  return { activeTaskCount: taskStates.running || 0, taskStates };
}

export async function startLocalExecutionBridge(
  input: Record<string, unknown>,
  context?: { chatId?: string; messageId?: string; toolCallId?: string },
  workspace?: AgentWorkspace,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bridges = await storage.localExecutionBridges.get();
  signal?.throwIfAborted();
  const bridge = resolveLocalExecutionBridge(
    bridges,
    text(input.bridgeId),
    text(input.bridgeName),
  );
  if (!bridge)
    return {
      success: false,
      error: "No local execution bridge is configured.",
      state: "missing",
    };
  const commandLine = text(
    input.command || input.shellCommand || input.task || input.prompt,
  );
  if (!commandLine)
    return {
      success: false,
      error: "Shell command is required.",
      state: "missing",
    };
  const task: Task = {
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
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(task.taskId, task);
  try {
    await testLocalExecutionBridge(bridge.id, signal);
    signal?.throwIfAborted();
    await markLocalExecutionBridgeTested(bridge.id, "", signal);
    signal?.throwIfAborted();
    const port = chrome.runtime.connectNative(bridge.hostName);
    task.port = port;
    const receive = (message: unknown) => receiveMessage(task, message);
    const disconnect = () => {
      // Read lastError even on terminal disconnects to consume Chrome's error.
      const error = chrome.runtime.lastError?.message;
      if (task.state === "running")
        finish(
          task,
          "error",
          error || "Execution bridge disconnected before reporting completion.",
        );
    };
    const abort = () => {
      void cancelTask(task);
    };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnect);
    signal?.addEventListener("abort", abort, { once: true });
    task.cleanup = () => {
      signal?.removeEventListener("abort", abort);
      port.onMessage.removeListener(receive);
      port.onDisconnect.removeListener(disconnect);
      port.disconnect();
      task.port = undefined;
    };
    port.postMessage({
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
      shell: text(input.shell),
      title: text(input.title),
      cwd: text(input.cwd) || bridge.defaultCwd || "",
      context: {
        ...context,
        workspaceFiles: workspace?.files?.map(({ path, kind, content }) => ({
          path,
          kind,
          content,
        })),
        inputContext: input.context,
      },
      timeoutMs: input.timeoutMs || bridge.timeoutMs,
    });
  } catch (error) {
    if (signal?.aborted) {
      await cancelTask(task);
      signal.throwIfAborted();
    }
    finish(
      task,
      "error",
      error instanceof Error ? error.message : String(error),
    );
    await markLocalExecutionBridgeTested(
      bridge.id,
      task.error || "Bridge startup failed.",
    );
  }
  return status(task.taskId);
}

export async function getLocalExecutionBridgeStatus(
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const taskId = text(input.taskId);
  const timeout = Number(input.timeoutMs);
  const until =
    Date.now() +
    (Number.isFinite(timeout)
      ? Math.min(30 * 60_000, Math.max(0, timeout))
      : 60_000);
  while (
    input.wait === true &&
    tasks.get(taskId)?.state === "running" &&
    Date.now() < until
  )
    await delay(Math.min(500, until - Date.now()), signal);
  signal?.throwIfAborted();
  return status(taskId);
}

export async function cancelLocalExecutionBridge(
  input: Record<string, unknown>,
) {
  const taskId = text(input.taskId);
  const task = tasks.get(taskId);
  if (task) await cancelTask(task);
  return status(taskId);
}

function cancelTask(task: Task): Promise<void> {
  if (task.canceling) return task.canceling;
  if (task.state !== "running") return Promise.resolve();
  if (!task.port) {
    finish(task, "canceled");
    return Promise.resolve();
  }
  task.canceling = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      finish(
        task,
        "error",
        "Cancellation was requested but the native bridge did not acknowledge it. Process termination is unconfirmed.",
      );
    }, CANCEL_ACK_TIMEOUT);
    task.finish = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      task.port!.postMessage({ type: "command.cancel", taskId: task.taskId });
    } catch {
      finish(
        task,
        "error",
        "Could not deliver cancellation to the native bridge. Process termination is unconfirmed.",
      );
    }
  });
  return task.canceling;
}

function receiveMessage(task: Task, value: unknown) {
  if (task.state !== "running" || !value || typeof value !== "object") return;
  const event = value as Record<string, unknown>;
  if (event.taskId && event.taskId !== task.taskId) return;
  task.updatedAt = Date.now();
  task.events.push(event);
  if (task.events.length > EVENT_LIMIT)
    task.events.splice(0, task.events.length - EVENT_LIMIT);
  // Preserve command output whitespace; trimming corrupts streamed text.
  if (
    ["stdout", "stderr", "message_delta", "text"].includes(
      text(event.event || event.type),
    )
  )
    task.output += String(event.data ?? event.text ?? "");
  if (event.result !== undefined) task.result = event.result;
  if (event.error !== undefined) task.error = text(event.error);
  const type = text(event.type || event.event);
  if (type === "command.error" || type === "error")
    finish(task, "error", task.error || "Local command failed.");
  else if (type === "command.done" || type === "done")
    finish(
      task,
      event.event === "canceled" ? "canceled" : task.error ? "error" : "done",
    );
}

function finish(task: Task, state: Task["state"], error?: string) {
  if (task.state !== "running") return;
  task.state = state;
  if (error) task.error = error;
  task.updatedAt = Date.now();
  task.cleanup?.();
  task.cleanup = undefined;
  task.finish?.();
}

function status(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return { success: false, state: "missing", taskId };
  return {
    success: task.state !== "error" && task.state !== "canceled",
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
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
