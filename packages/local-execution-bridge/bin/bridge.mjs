#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const configPath =
  process.env.OPENBROWSERAGENT_LOCAL_EXECUTION_CONFIG ||
  resolve(scriptDir, "local-execution-bridge.config.json");
const config = loadConfig(configPath);
const tasks = new Map();
const AGENT_CLI_CANDIDATES = [
  { id: "claude", name: "Claude Code", command: "claude" },
  { id: "codex", name: "OpenAI Codex", command: "codex" },
  { id: "opencode", name: "OpenCode", command: "opencode" },
  { id: "gemini", name: "Gemini CLI", command: "gemini" },
  { id: "qwen", name: "Qwen Code", command: "qwen" },
  { id: "goose", name: "Goose", command: "goose" },
  { id: "aider", name: "Aider", command: "aider" },
  { id: "crush", name: "Crush", command: "crush" },
  { id: "amp", name: "Amp", command: "amp" },
  { id: "cursor-agent", name: "Cursor Agent", command: "cursor-agent" },
  { id: "junie", name: "Junie", command: "junie" },
  { id: "antigravity", name: "Antigravity CLI", command: "antigravity" },
  { id: "gravity-index", name: "Gravity Index", command: "gravity-index" },
  { id: "agents-cli", name: "Google Agents CLI", command: "agents-cli" },
];

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
  const config = resolveCommand(message);
  if (!config) return;
  const shell = resolveShell(String(config.shell || ""));
  const agentCli = detectAgentCli();
  writeMessage({
    type: "command.pong",
    command: message.command,
    shell: shell.command,
    shellArgsPreview: shell.args("<command>"),
    platform: platform(),
    cwd: String(config.cwd || process.cwd()),
    node: process.version,
    env: {
      home: process.env.HOME || process.env.USERPROFILE || "",
      path: process.env.PATH || "",
      shell: process.env.SHELL || process.env.ComSpec || "",
      executionHost: String(message.command?.hostAddress || ""),
      agentCli,
    },
    agentCli,
  });
}

function runCommand(message) {
  const taskId = String(message.taskId || cryptoRandomId());
  const config = resolveCommand(message, taskId);
  if (!config) return;
  const commandLine = String(
    message.commandLine || message.shellCommand || "",
  ).trim();
  if (!commandLine) {
    writeMessage({
      type: "command.error",
      taskId,
      error: "Shell command is required.",
    });
    return;
  }
  const cwd = String(message.cwd || config.cwd || process.cwd());
  const hostAddress = String(message.command?.hostAddress || "");
  const shell = resolveShell(String(message.shell || config.shell || ""));
  const child = spawn(shell.command, shell.args(commandLine), {
    cwd,
    shell: false,
    env: {
      ...process.env,
      OPENBROWSERAGENT_EXECUTION_HOST: hostAddress,
      ...(config.env || {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  tasks.set(taskId, { child });
  writeMessage({
    type: "status",
    event: "started",
    taskId,
    data: commandLine,
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
    writeMessage({
      type: "command.error",
      taskId,
      error: formatSpawnError(error, shell.command),
    });
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
  child.stdin.end();
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
      error: `Unknown shell config: ${key}`,
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

function resolveShell(value) {
  const requested = value.trim().toLowerCase();
  if (platform() === "win32") {
    if (requested === "cmd") {
      return {
        command: process.env.ComSpec || "cmd.exe",
        args: (commandLine) => ["/d", "/s", "/c", commandLine],
      };
    }
    return {
      command:
        requested && requested !== "powershell" ? value : "powershell.exe",
      args: (commandLine) => [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        commandLine,
      ],
    };
  }
  return {
    command: requested || process.env.SHELL || "sh",
    args: (commandLine) => ["-lc", commandLine],
  };
}

function detectAgentCli() {
  return AGENT_CLI_CANDIDATES.map((candidate) =>
    detectExecutable(candidate),
  ).filter(Boolean);
}

function detectExecutable(candidate) {
  const path = locateExecutable(candidate.command);
  if (!path) return null;
  const result = spawnSync(candidate.command, ["--version"], {
    encoding: "utf8",
    timeout: 1000,
    windowsHide: true,
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const output = (stdout || stderr).split(/\r?\n/)[0]?.trim() || "";
  return {
    id: candidate.id,
    name: candidate.name,
    command: candidate.command,
    path,
    available: true,
    version: output.slice(0, 160),
    status: result.error
      ? result.error.code === "ETIMEDOUT"
        ? "timeout"
        : "error"
      : result.status === 0
        ? "available"
        : "error",
  };
}

function locateExecutable(command) {
  const locator = platform() === "win32" ? "where.exe" : "command";
  const args = platform() === "win32" ? [command] : ["-v", command];
  const result = spawnSync(locator, args, {
    encoding: "utf8",
    timeout: 1000,
    windowsHide: true,
    shell: platform() !== "win32",
  });
  if (result.status !== 0) return "";
  return (
    String(result.stdout || "")
      .split(/\r?\n/)[0]
      ?.trim() || ""
  );
}

function formatSpawnError(error, command) {
  if (error?.code === "ENOENT") {
    return `Shell not found: ${command}. Install that shell or choose another shell.`;
  }
  return error?.message || String(error);
}
