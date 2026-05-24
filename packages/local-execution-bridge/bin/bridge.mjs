#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const configPath =
  process.env.OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG ||
  resolve(scriptDir, "local-execution-bridge.config.json");
const config = loadConfig(configPath);
const tasks = new Map();

let input = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  readMessages();
});

process.stdin.on("end", () => {
  for (const task of tasks.values()) task.child.kill();
});

function readMessages() {
  while (input.length >= 4) {
    const length = input.readUInt32LE(0);
    if (input.length < length + 4) return;
    const payload = input.subarray(4, length + 4);
    input = input.subarray(length + 4);
    handleMessage(parseMessage(payload));
  }
}

function handleMessage(message) {
  if (message.type === "command.ping") {
    pingCommand(message);
    return;
  }
  if (message.type === "command.cancel") {
    cancelTask(String(message.taskId || ""));
    return;
  }
  if (message.type === "command.run") {
    runCommand(message);
    return;
  }
  writeMessage({
    type: "error",
    error: `Unknown message type: ${message.type}`,
  });
}

function pingCommand(message) {
  const command = resolveCommand(message);
  if (!command) return;
  writeMessage({ type: "command.pong", command: message.command });
}

function runCommand(message) {
  const taskId = String(message.taskId || cryptoRandomId());
  const command = resolveCommand(message, taskId);
  if (!command) return;
  const cwd = String(message.cwd || command.cwd || process.cwd());
  const hostAddress = String(message.command?.hostAddress || "");
  const child = spawn(command.command, command.args || [], {
    cwd,
    shell: command.shell === true,
    env: {
      ...process.env,
      OPENBROWSERAGENT_EXECUTION_HOST: hostAddress,
      ...(command.env || {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  tasks.set(taskId, { child });
  writeMessage({
    type: "status",
    event: "started",
    taskId,
    data: command.name || command.id,
  });

  child.stdout.on("data", (chunk) =>
    writeMessage({
      type: "stdout",
      event: "stdout",
      taskId,
      data: chunk.toString(),
    }),
  );
  child.stderr.on("data", (chunk) =>
    writeMessage({
      type: "stderr",
      event: "stderr",
      taskId,
      data: chunk.toString(),
    }),
  );
  child.on("error", (error) => {
    tasks.delete(taskId);
    writeMessage({ type: "command.error", taskId, error: error.message });
  });
  child.on("close", (code, signal) => {
    tasks.delete(taskId);
    writeMessage({
      type: code === 0 ? "command.done" : "command.error",
      taskId,
      result: { code, signal },
      error: code === 0 ? undefined : `Local command exited with code ${code}`,
    });
  });

  const prompt = buildPrompt(message);
  child.stdin.end(prompt);
}

function resolveCommand(message, taskId = "") {
  const key = String(message.command?.key || message.command?.id || "");
  const command = config.commands.find(
    (item) => item.id === key || item.name === key,
  );
  if (!command) {
    writeMessage({
      type: "command.error",
      taskId,
      error: `Unknown command config: ${key}`,
    });
    return null;
  }
  const expectedSecret = String(command.secret || "");
  const actualSecret = String(message.command?.secret || "");
  if (!expectedSecret || actualSecret !== expectedSecret) {
    writeMessage({
      type: "command.error",
      taskId,
      error: "Execution bridge secret is missing or invalid.",
    });
    return null;
  }
  return command;
}

function cancelTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) {
    writeMessage({ type: "status", event: "missing", taskId });
    return;
  }
  task.child.kill();
  tasks.delete(taskId);
  writeMessage({ type: "command.done", event: "canceled", taskId });
}

function buildPrompt(message) {
  const parts = [];
  if (message.title) parts.push(`# ${message.title}`);
  parts.push(String(message.prompt || ""));
  if (message.context) {
    parts.push("\nContext JSON:");
    parts.push(JSON.stringify(message.context, null, 2));
  }
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}

function loadConfig(path) {
  if (!existsSync(path)) return { commands: [] };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return { commands: Array.isArray(parsed.commands) ? parsed.commands : [] };
}

function parseMessage(payload) {
  try {
    return JSON.parse(payload.toString("utf8"));
  } catch (error) {
    return {
      type: "invalid",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
