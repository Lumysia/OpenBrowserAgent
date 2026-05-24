import {
  generateLocalAgentSecret,
  normalizeLocalAgents,
  resolveLocalAgent,
} from "../shared/local-agents";
import {
  LOCAL_AGENT_RUNTIME_MESSAGE_TYPE,
  type LocalAgentRuntimeResponse,
} from "../shared/local-agent-runtime";
import { storage } from "../shared/storage";
import type { AgentWorkspace, LocalAgentConfig } from "../shared/types";

const LOCAL_AGENT_EVENT_LIMIT = 80;

type LocalAgentState = "running" | "done" | "error" | "missing" | "canceled";

type LocalAgentTask = {
  taskId: string;
  agent: Pick<
    LocalAgentConfig,
    "id" | "name" | "hostName" | "hostAddress" | "agentKey"
  >;
  state: LocalAgentState;
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
};

const tasks = new Map<string, LocalAgentTask>();

export async function listLocalExecutionBridges() {
  const agents = normalizeLocalAgents(await storage.localAgents.get());
  return {
    agents: agents.map((agent) => safeLocalAgent(agent)),
  };
}

export async function addLocalExecutionBridge(input: Record<string, unknown>) {
  const now = Date.now();
  const inputSecret = stringValue(input.secret);
  const generatedSecret = inputSecret ? "" : generateLocalAgentSecret();
  const agent = normalizeLocalAgents([
    {
      id: crypto.randomUUID(),
      name: stringValue(input.name) || "Execution Bridge",
      description: stringValue(input.description),
      hostName:
        stringValue(input.hostName) ||
        "openbrowseragent.local_execution_bridge",
      hostAddress: stringValue(input.hostAddress),
      secret: inputSecret || generatedSecret,
      agentKey: stringValue(input.agentKey),
      defaultCwd: stringValue(input.defaultCwd),
      timeoutMs: input.timeoutMs as number | undefined,
      createdAt: now,
      updatedAt: now,
    },
  ])[0];
  await storage.localAgents.set([...(await storage.localAgents.get()), agent]);
  if (input.test === true) {
    const tested = await testLocalExecutionBridgeConfig({ agentId: agent.id });
    return includeSecretResult(tested, agent.id, !inputSecret);
  }
  return { success: true, agent: safeLocalAgent(agent, !inputSecret) };
}

export async function updateLocalExecutionBridge(
  input: Record<string, unknown>,
): Promise<unknown> {
  const agentId = stringValue(input.agentId || input.id);
  if (!agentId) return { success: false, error: "Missing execution bridge ID" };
  let updated: LocalAgentConfig | undefined;
  const rotateSecret = input.regenerateSecret === true;
  await storage.localAgents.set(
    normalizeLocalAgents(await storage.localAgents.get()).map((agent) => {
      if (agent.id !== agentId) return agent;
      const patch: Partial<LocalAgentConfig> = {
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
        ...(input.agentKey !== undefined
          ? { agentKey: stringValue(input.agentKey) }
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
        ...(rotateSecret ? { secret: generateLocalAgentSecret() } : {}),
        updatedAt: Date.now(),
      };
      const needsRetest =
        input.hostName !== undefined ||
        input.hostAddress !== undefined ||
        input.agentKey !== undefined ||
        input.secret !== undefined ||
        rotateSecret;
      updated = normalizeLocalAgents([
        {
          ...agent,
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
    const tested = await testLocalExecutionBridgeConfig({ agentId });
    return includeSecretResult(tested, agentId, rotateSecret);
  }
  return { success: true, agent: safeLocalAgent(updated, rotateSecret) };
}

export async function testLocalExecutionBridgeConfig(
  input: Record<string, unknown>,
) {
  const agentId = stringValue(input.agentId || input.id);
  if (!agentId) return { success: false, error: "Missing execution bridge ID" };
  let result: Record<string, unknown> | undefined;
  let testError = "";
  const agents = normalizeLocalAgents(await storage.localAgents.get());
  await storage.localAgents.set(
    await Promise.all(
      agents.map(async (agent) => {
        if (agent.id !== agentId) return agent;
        try {
          const bridge = await testLocalExecutionBridge(agent.id);
          const next = {
            ...agent,
            lastTestedAt: Date.now(),
            lastTestError: "",
            updatedAt: Date.now(),
          };
          result = { ...safeLocalAgent(next), bridge };
          return next;
        } catch (error) {
          testError = errorMessage(error);
          const next = {
            ...agent,
            lastTestedAt: undefined,
            lastTestError: testError,
            updatedAt: Date.now(),
          };
          result = safeLocalAgent(next);
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
        agent: result,
      }
    : { success: true, agent: result };
}

export async function deleteLocalExecutionBridge(
  input: Record<string, unknown>,
) {
  const agentId = stringValue(input.agentId || input.id);
  const agents = await storage.localAgents.get();
  const next = agents.filter((agent) => agent.id !== agentId);
  await storage.localAgents.set(next);
  return { success: next.length !== agents.length, agentId };
}

export async function startLocalExecutionBridge(
  input: Record<string, unknown>,
  context?: { chatId?: string; messageId?: string; toolCallId?: string },
  workspace?: AgentWorkspace,
) {
  const agents = await storage.localAgents.get();
  const agent = resolveLocalAgent(
    agents,
    stringValue(input.agentId),
    stringValue(input.agentName),
  );
  if (!agent)
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

  const task = createTask(agent);
  tasks.set(task.taskId, task);
  try {
    await testLocalExecutionBridge(agent.id);
    await markLocalExecutionBridgeTested(agent.id, "");
    task.port = chrome.runtime.connectNative(agent.hostName);
    task.port.onMessage.addListener((message) =>
      receiveAgentMessage(task, message),
    );
    task.port.onDisconnect.addListener(() => finishDisconnectedTask(task));
    task.port.postMessage({
      type: "command.run",
      taskId: task.taskId,
      command: {
        id: agent.id,
        key: agent.agentKey || agent.id,
        name: agent.name,
        hostAddress: agent.hostAddress || "",
        secret: agent.secret || "",
      },
      commandLine,
      shell: stringValue(input.shell),
      title: stringValue(input.title),
      cwd: stringValue(input.cwd) || agent.defaultCwd || "",
      context: {
        ...context,
        workspaceFiles: workspace?.files?.map((file) => ({
          path: file.path,
          kind: file.kind,
          content: file.content,
        })),
        inputContext: input.context,
      },
      timeoutMs: input.timeoutMs || agent.timeoutMs,
    });
  } catch (error) {
    task.state = "error";
    task.error = errorMessage(error);
    task.updatedAt = Date.now();
    await markLocalExecutionBridgeTested(agent.id, task.error);
  }

  return taskStatus(task.taskId);
}

export async function getLocalExecutionBridgeStatus(
  input: Record<string, unknown>,
) {
  const taskId = stringValue(input.taskId);
  const wait = input.wait === true;
  const timeoutMs = clampStatusTimeout(input.timeoutMs);
  if (wait) await waitForLocalAgent(taskId, timeoutMs);
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

export async function testLocalExecutionBridge(agentId: string) {
  const agent = normalizeLocalAgents(await storage.localAgents.get()).find(
    (item) => item.id === agentId,
  );
  if (!agent) throw new Error("Local execution bridge not found.");
  if (!agent.hostName) throw new Error("Native host name is required.");
  const port = chrome.runtime.connectNative(agent.hostName);
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
        id: agent.id,
        key: agent.agentKey || agent.id,
        name: agent.name,
        hostAddress: agent.hostAddress || "",
        secret: agent.secret || "",
      },
    });
  });
}

export function handleLocalAgentRuntimeMessage(
  message: unknown,
  sendResponse: (response: LocalAgentRuntimeResponse) => void,
) {
  const request = objectValue(message);
  if (request.type !== LOCAL_AGENT_RUNTIME_MESSAGE_TYPE) return false;
  const operation = stringValue(request.operation);
  const promise =
    operation === "test"
      ? testLocalExecutionBridge(stringValue(request.agentId))
      : Promise.reject(new Error("Unknown local execution bridge operation."));
  promise
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
}

function createTask(agent: LocalAgentConfig): LocalAgentTask {
  const now = Date.now();
  return {
    taskId: crypto.randomUUID(),
    agent: {
      id: agent.id,
      name: agent.name,
      hostName: agent.hostName,
      hostAddress: agent.hostAddress,
      agentKey: agent.agentKey,
    },
    state: "running",
    output: "",
    events: [],
    startedAt: now,
    updatedAt: now,
  };
}

function receiveAgentMessage(task: LocalAgentTask, message: unknown) {
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

function finishDisconnectedTask(task: LocalAgentTask) {
  if (task.state !== "running") return;
  const error = chrome.runtime.lastError?.message;
  task.state = error ? "error" : "done";
  task.error = error || task.error;
  task.updatedAt = Date.now();
}

async function waitForLocalAgent(taskId: string, timeoutMs: number) {
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
    agent: task.agent,
    output: task.output,
    result: task.result,
    ...(task.error ? { error: task.error } : {}),
    progress: task.events.slice(-8),
    startedAt: task.startedAt,
    updatedAt: task.updatedAt,
  };
}

function safeLocalAgent(agent: LocalAgentConfig, includeSecret = false) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    hostName: agent.hostName,
    hostAddress: agent.hostAddress,
    agentKey: agent.agentKey,
    tested: isLocalAgentTested(agent),
    lastTestError: agent.lastTestError || "",
    defaultCwd: agent.defaultCwd,
    timeoutMs: agent.timeoutMs,
    ...(includeSecret ? { secret: agent.secret } : {}),
  };
}

async function markLocalExecutionBridgeTested(agentId: string, error: string) {
  const now = Date.now();
  await storage.localAgents.set(
    normalizeLocalAgents(await storage.localAgents.get()).map((agent) =>
      agent.id === agentId
        ? {
            ...agent,
            lastTestedAt: error ? undefined : now,
            lastTestError: error,
            updatedAt: now,
          }
        : agent,
    ),
  );
}

async function includeSecretResult(
  result: unknown,
  agentId: string,
  includeSecret: boolean,
) {
  if (!includeSecret) return result;
  const agent = normalizeLocalAgents(await storage.localAgents.get()).find(
    (item) => item.id === agentId,
  );
  if (!agent || !result || typeof result !== "object") return result;
  return { ...result, agent: safeLocalAgent(agent, true) };
}

function isLocalAgentTested(agent: LocalAgentConfig) {
  return !!agent.lastTestedAt && !agent.lastTestError;
}

function pushEvent(task: LocalAgentTask, event: Record<string, unknown>) {
  task.events.push(event);
  if (task.events.length > LOCAL_AGENT_EVENT_LIMIT)
    task.events.splice(0, task.events.length - LOCAL_AGENT_EVENT_LIMIT);
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
