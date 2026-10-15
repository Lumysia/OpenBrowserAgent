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
// The protocol, as in the extension's src/shared/local-execution-bridge-protocol.ts
// and LOCAL_EXECUTION_BRIDGE_LIMITS (this file is installed on its own).
const MESSAGE = {
  ping: "command.ping",
  run: "command.run",
  cancel: "command.cancel",
  pong: "command.pong",
  error: "command.error",
  done: "command.done",
  stdout: "stdout",
  stderr: "stderr",
};
const ERROR = {
  unknownShellConfig: "unknownShellConfig",
  badSecret: "badSecret",
  missingCommand: "missingCommand",
  timeout: "timeout",
  exitCode: "exitCode",
  spawnFailed: "spawnFailed",
  unknownMessage: "unknownMessage",
};
const DEFAULT_TIMEOUT_MS = 2 * 60_000;
const MAX_TIMEOUT_MS = 30 * 60_000;
const LOCAL_CLI_CANDIDATES = [
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
  for (const taskId of tasks.keys()) cancelTask(taskId);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await Promise.all([...tasks.keys()].map((taskId) => cancelTask(taskId)));
    process.exit(0);
  });
// A disconnected browser may close stdout before cancellation has completed.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE")
    for (const taskId of tasks.keys()) cancelTask(taskId);
  else throw error;
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
  if (message.type === MESSAGE.ping) {
    pingCommand(message);
    return;
  }
  if (message.type === MESSAGE.cancel) {
    cancelTask(String(message.taskId || ""));
    return;
  }
  if (message.type === MESSAGE.run) {
    runCommand(message);
    return;
  }
  writeMessage({
    type: MESSAGE.error,
    code: ERROR.unknownMessage,
    error: `Unknown message type: ${message.type}`,
  });
}

function pingCommand(message) {
  const config = resolveCommand(message);
  if (!config) return;
  const shell = resolveShell(String(config.shell || ""));
  const localCli = detectLocalCli();
  writeMessage({
    type: MESSAGE.pong,
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
      localCli,
    },
    localCli,
  });
}

function runCommand(message) {
  const taskId = String(message.taskId || cryptoRandomId());
  const config = resolveCommand(message, taskId);
  if (!config) return;
  const commandLine = String(message.commandLine || "").trim();
  if (!commandLine) {
    writeMessage({
      type: MESSAGE.error,
      code: ERROR.missingCommand,
      taskId,
      error: "Shell command is required.",
    });
    return;
  }
  const cwd = String(message.cwd || config.cwd || process.cwd());
  const hostAddress = String(message.command?.hostAddress || "");
  const shell = resolveShell(String(message.shell || config.shell || ""));
  const child = spawn(shell.command, shell.args(commandLine), {
    detached: process.platform !== "win32",
    cwd,
    shell: false,
    env: {
      ...process.env,
      OPENBROWSERAGENT_EXECUTION_HOST: hostAddress,
      ...(config.env || {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // reason: why the process group is being stopped ("completed" when the
  // shell exited on its own); stopping: the kill in progress.
  const task = {
    child,
    reason: undefined,
    stopping: undefined,
    error: "",
    code: undefined,
  };
  tasks.set(taskId, task);
  const timer = setTimeout(
    () => cancelTask(taskId, "timeout"),
    commandTimeout(message.timeoutMs || config.timeoutMs),
  );
  writeMessage({
    type: "status",
    event: "started",
    taskId,
    data: commandLine,
  });
  for (const stream of [MESSAGE.stdout, MESSAGE.stderr])
    child[stream].on("data", (chunk) =>
      writeMessage({
        type: stream,
        event: stream,
        taskId,
        data: chunk.toString(),
      }),
    );
  // A spawn failure emits "error" and then "close"; report it from close.
  child.on("error", (error) => {
    task.error = formatSpawnError(error, shell.command);
    task.code = ERROR.spawnFailed;
  });
  // Shell completion bounds the command's lifetime, including background work
  // that inherited its process group. Start cleanup on exit, not close: a child
  // may still hold stdout/stderr open after the shell has exited.
  child.on("exit", () => {
    if (process.platform !== "win32") cancelTask(taskId, "completed");
  });
  child.on("close", async (code, signal) => {
    clearTimeout(timer);
    await task.stopping;
    tasks.delete(taskId);
    const canceled = task.reason === "canceled" && !task.error;
    const [errorCode, error] = task.error
      ? [task.code, task.error]
      : task.reason === "timeout"
        ? [ERROR.timeout, "Local command timed out."]
        : canceled || code === 0
          ? []
          : [ERROR.exitCode, `Local command exited with code ${code}`];
    writeMessage({
      type: error ? MESSAGE.error : MESSAGE.done,
      ...(canceled ? { event: "canceled" } : {}),
      ...(errorCode ? { code: errorCode } : {}),
      taskId,
      result: { code, signal },
      error,
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
      type: MESSAGE.error,
      code: ERROR.unknownShellConfig,
      taskId,
      error: `Unknown shell config: ${key}`,
    });
    return null;
  }
  const expectedSecret = String(command.secret || "");
  const actualSecret = String(message.command?.secret || "");
  if (!expectedSecret || actualSecret !== expectedSecret) {
    writeMessage({
      type: MESSAGE.error,
      code: ERROR.badSecret,
      taskId,
      error: "Execution bridge secret is missing or invalid.",
    });
    return null;
  }
  return command;
}

function cancelTask(taskId, reason = "canceled") {
  const task = tasks.get(taskId);
  if (!task) {
    writeMessage({ type: "status", event: "missing", taskId });
    return;
  }
  // A cancel or timeout that arrives during exit cleanup still decides the result.
  if (!task.reason || task.reason === "completed") task.reason = reason;
  task.stopping ??= terminateProcessTree(task.child).catch((error) => {
    task.error = error.message;
  });
  return task.stopping;
}

// Keep the installed host self-contained. POSIX groups retain ownership of
// descendants after the shell exits; already committed effects are not undone.
// This does not contain descendants that deliberately leave the process group.
async function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        { windowsHide: true },
      );
      killer.once("error", reject);
      killer.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Process tree termination failed (${code})`)),
      );
    });
    return;
  }
  const kill = (signal) => {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      return false;
    }
  };
  if (!kill("SIGTERM")) return;
  await new Promise((resolve) => setTimeout(resolve, 500));
  kill("SIGKILL");
}

function commandTimeout(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(MAX_TIMEOUT_MS, Math.trunc(number))
    : DEFAULT_TIMEOUT_MS;
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
    command: value.trim() || process.env.SHELL || "sh",
    args: (commandLine) => ["-lc", commandLine],
  };
}

function detectLocalCli() {
  return LOCAL_CLI_CANDIDATES.map((candidate) =>
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
