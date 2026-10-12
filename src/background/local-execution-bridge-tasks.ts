import { resolveLocalExecutionBridge } from "../shared/local-execution-bridges";
import { storage } from "../shared/storage";
import type {
  AgentWorkspace,
  LocalExecutionBridgeConfig,
} from "../shared/types";

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

export function bridgeTaskCounts() {
  const taskStates: Record<string, number> = {};
  for (const task of tasks.values())
    taskStates[task.state] = (taskStates[task.state] || 0) + 1;
  return { activeTaskCount: taskStates.running || 0, taskStates };
}

async function startTask(
  input: Record<string, unknown>,
  context?: { chatId?: string; messageId?: string; toolCallId?: string },
  workspace?: AgentWorkspace,
  signal?: AbortSignal,
) {
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
    received: 0,
    events: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.set(task.taskId, task);
  // Keep only recent finished tasks; Map order is insertion order.
  const finished = [...tasks.values()].filter((t) => t.state !== "running");
  for (const old of finished.slice(0, -FINISHED_TASK_LIMIT))
    tasks.delete(old.taskId);
  try {
    // No ping first: command.run reports a bad key or secret itself.
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
    finish(
      task,
      "error",
      error instanceof Error ? error.message : String(error),
    );
  }
  return status(task.taskId);
}

const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60_000;
const MAX_COMMAND_TIMEOUT_MS = 30 * 60_000;
const START_SETTLE_MS = 1_000;

// Runs one command and resolves when it finishes, fails, times out or the
// run is stopped (which cancels it).
export async function runLocalCommand(
  input: Record<string, unknown>,
  context: { chatId?: string; messageId?: string; toolCallId?: string },
  workspace?: AgentWorkspace,
  signal?: AbortSignal,
) {
  const started = await startTask(input, context, workspace, signal);
  const task = tasks.get(String((started as { taskId?: string }).taskId || ""));
  if (!task) return started;
  const requested = Number(input.timeoutMs);
  const timeout = Math.min(
    MAX_COMMAND_TIMEOUT_MS,
    Number.isFinite(requested) && requested > 0
      ? requested
      : DEFAULT_COMMAND_TIMEOUT_MS,
  );
  await new Promise<void>((resolve) => {
    if (task.state !== "running") return resolve();
    const timer = setTimeout(() => {
      cancelTask(task);
      task.error = `Timed out after ${Math.round(timeout / 1000)} s.`;
    }, timeout);
    task.settled = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  signal?.throwIfAborted();
  return status(task.taskId);
}

// Starts a command that keeps running after the call returns (a dev server,
// a long job). Stopping the chat does not cancel it; cancel does.
export async function startLocalCommand(
  input: Record<string, unknown>,
  context: { chatId?: string; messageId?: string; toolCallId?: string },
  workspace?: AgentWorkspace,
) {
  const started = await startTask(input, context, workspace);
  const task = tasks.get(String((started as { taskId?: string }).taskId || ""));
  // A command that fails at once (bad key, unknown shell) says so now.
  if (task?.state === "running")
    await new Promise((resolve) => setTimeout(resolve, START_SETTLE_MS));
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
    task.port?.postMessage({ type: "command.cancel", taskId: task.taskId });
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
  if (
    ["stdout", "stderr", "message_delta", "text"].includes(
      text(event.event || event.type),
    )
  ) {
    const chunk = String(event.data ?? event.text ?? "");
    task.output = (task.output + chunk).slice(-OUTPUT_LIMIT);
    task.received += chunk.length;
  }
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
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  };
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
