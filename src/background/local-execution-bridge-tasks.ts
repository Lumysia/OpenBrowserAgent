import { getBrowserApi } from "../shared/browser-api";
import { LOCAL_EXECUTION_BRIDGE_LIMITS } from "../shared/config";
import { errorMessage } from "../shared/error-message";
import {
  BRIDGE_MESSAGE,
  bridgeCommand,
} from "../shared/local-execution-bridge-protocol";
import {
  localExecutionBridgeCommandTimeout,
  resolveLocalExecutionBridge,
} from "../shared/local-execution-bridges";
import { storage } from "../shared/storage";
import type { LocalExecutionBridgeConfig } from "../shared/types";
import { stringOf, trimmedString } from "../shared/values";
import { bridgeHostError } from "./bridge-connection";

// What the localCommand tool asks a bridge to run.
export type LocalCommandRequest = {
  command: string;
  // Bridge id or name; the first bridge when empty.
  bridge?: string;
  cwd?: string;
  shell?: string;
  // Asked for by the model; the bridge's own timeout when missing.
  timeoutMs?: unknown;
};

type Task = {
  taskId: string;
  bridge: Pick<
    LocalExecutionBridgeConfig,
    "id" | "name" | "hostName" | "hostAddress" | "bridgeKey"
  >;
  state: "running" | "done" | "error" | "canceled";
  // The tail of the output, and how many characters arrived in total.
  output: string;
  received: number;
  error?: string;
  result?: unknown;
  events: Record<string, unknown>[];
  timeoutMs: number;
  startedAt: number;
  updatedAt: number;
  port?: chrome.runtime.Port;
  cleanup?: () => void;
  settled?: () => void;
};
const tasks = new Map<string, Task>();
const EVENT_LIMIT = 80;
const OUTPUT_LIMIT = 64 * 1024;
const FINISHED_TASK_LIMIT = 20;
const OUTPUT_MESSAGES = new Set<string>([
  BRIDGE_MESSAGE.stdout,
  BRIDGE_MESSAGE.stderr,
]);

export function bridgeTaskCounts() {
  const taskStates: Record<string, number> = {};
  for (const task of tasks.values())
    taskStates[task.state] = (taskStates[task.state] || 0) + 1;
  return { activeTaskCount: taskStates.running || 0, taskStates };
}

async function startTask(request: LocalCommandRequest, signal?: AbortSignal) {
  const bridges = await storage.localExecutionBridges.get();
  signal?.throwIfAborted();
  const bridge = resolveLocalExecutionBridge(
    bridges,
    request.bridge,
    request.bridge,
  );
  if (!bridge)
    return {
      success: false,
      error: "No local execution bridge is configured.",
      state: "missing",
    };
  const commandLine = request.command.trim();
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
    received: 0,
    events: [],
    timeoutMs: localExecutionBridgeCommandTimeout(bridge, request.timeoutMs),
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(task.taskId, task);
  // Keep only recent finished tasks; Map order is insertion order.
  const finished = [...tasks.values()].filter((t) => t.state !== "running");
  for (const old of finished.slice(0, -FINISHED_TASK_LIMIT))
    tasks.delete(old.taskId);
  try {
    const runtime = getBrowserApi().runtime;
    // No ping first: command.run reports a bad key or secret itself.
    const port = runtime.connectNative(bridge.hostName);
    task.port = port;
    const receive = (message: unknown) => receiveMessage(task, message);
    const disconnect = () => {
      // Read lastError even on terminal disconnects to consume Chrome's error.
      const error = runtime.lastError?.message;
      if (task.state === "running")
        finish(
          task,
          "error",
          error || "Execution bridge disconnected before reporting completion.",
        );
    };
    const abort = () => cancelTask(task);
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
      type: BRIDGE_MESSAGE.run,
      taskId: task.taskId,
      command: bridgeCommand(bridge),
      commandLine,
      shell: trimmedString(request.shell),
      cwd: trimmedString(request.cwd) || bridge.defaultCwd || "",
      timeoutMs: task.timeoutMs,
    });
  } catch (error) {
    finish(task, "error", errorMessage(error));
  }
  return status(task.taskId);
}

// Runs one command and resolves when it finishes, fails, times out or the
// run is stopped (which cancels it). The host stops the command at its
// timeout; the extension stops waiting a little later in case the host
// cannot say so.
export async function runLocalCommand(
  request: LocalCommandRequest,
  signal?: AbortSignal,
) {
  const started = await startTask(request, signal);
  const task = tasks.get(String((started as { taskId?: string }).taskId || ""));
  if (!task) return started;
  await new Promise<void>((resolve) => {
    if (task.state !== "running") return resolve();
    const timer = setTimeout(() => {
      cancelTask(task);
      task.error = `Timed out after ${Math.round(task.timeoutMs / 1000)} s.`;
    }, task.timeoutMs + LOCAL_EXECUTION_BRIDGE_LIMITS.timeoutGraceMs);
    task.settled = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  signal?.throwIfAborted();
  return status(task.taskId);
}

// Starts a command that keeps running after the call returns (a dev server,
// a long job) until it ends, times out or is cancelled. Stopping the chat
// does not cancel it.
export async function startLocalCommand(request: LocalCommandRequest) {
  const started = await startTask(request);
  const task = tasks.get(String((started as { taskId?: string }).taskId || ""));
  // A command that fails at once (bad key, unknown shell) says so now.
  if (task?.state === "running")
    await new Promise((resolve) =>
      setTimeout(resolve, LOCAL_EXECUTION_BRIDGE_LIMITS.startSettleMs),
    );
  return task ? status(task.taskId) : started;
}

export function localCommandStatus(taskId: string) {
  return status(taskId);
}

export function cancelLocalCommand(taskId: string) {
  const task = tasks.get(taskId);
  if (task) cancelTask(task);
  return status(taskId);
}

// Disconnecting closes the host's stdin; the host then kills every task's
// process group, so there is no acknowledgement to wait for.
function cancelTask(task: Task) {
  if (task.state !== "running") return;
  try {
    task.port?.postMessage({
      type: BRIDGE_MESSAGE.cancel,
      taskId: task.taskId,
    });
  } catch {
    // The port is already gone; disconnect below still applies.
  }
  finish(task, "canceled");
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
  if (OUTPUT_MESSAGES.has(stringOf(event.type))) {
    const chunk = stringOf(event.data);
    task.output = (task.output + chunk).slice(-OUTPUT_LIMIT);
    task.received += chunk.length;
  }
  if (event.result !== undefined) task.result = event.result;
  if (event.type === BRIDGE_MESSAGE.error)
    finish(task, "error", bridgeHostError(event).message);
  else if (event.type === BRIDGE_MESSAGE.done)
    finish(task, event.event === "canceled" ? "canceled" : "done");
}

function finish(task: Task, state: Task["state"], error?: string) {
  if (task.state !== "running") return;
  task.state = state;
  if (error) task.error = error;
  task.updatedAt = Date.now();
  task.cleanup?.();
  task.cleanup = undefined;
  task.settled?.();
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
    received: task.received,
    result: task.result,
    ...(task.error ? { error: task.error } : {}),
    progress: task.events.slice(-8),
    timeoutMs: task.timeoutMs,
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  };
}
