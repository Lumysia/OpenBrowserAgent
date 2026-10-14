import { LOCAL_EXECUTION_BRIDGE_LIMITS } from "../../shared/config";
import { TOOL_NAME } from "../../shared/tool-names";
import {
  cancelLocalCommand,
  localCommandStatus,
  type LocalCommandRequest,
  runLocalCommand,
  startLocalCommand,
} from "../local-execution-bridge-tasks";
import {
  LOCAL_BRIDGE_ACTIONS,
  runLocalBridgesAction,
} from "../local-execution-bridge-tools";
import {
  fail,
  json,
  schema,
  stringArg,
  type ToolDefinition,
  type ToolResult,
} from "./types";

const OUTPUT_SHOWN = 4_000;
const minutes = (ms: number) => ms / 60_000;

export const localCommandTool: ToolDefinition = {
  name: TOOL_NAME.localCommand,
  group: "localExecution",
  onDemand: true,
  summary: "Run shell commands on the user's computer through a local bridge",
  description:
    "Run shell commands on the user's computer through a configured, tested local execution bridge. run (default): wait for the command to finish (stopping the chat cancels it). start: run it in the background (dev servers, long jobs) and get a taskId; it keeps running until it ends or is cancelled. status (taskId, offset): state and the output that arrived after offset. cancel (taskId).",
  parameters: schema({
    action: { type: "string", enum: ["run", "start", "status", "cancel"] },
    command: { type: "string", description: "Exact shell command line." },
    taskId: { type: "string" },
    offset: {
      type: "number",
      description: "status: output characters already read.",
    },
    bridge: {
      type: "string",
      description: "Bridge id or name. Defaults to the first bridge.",
    },
    cwd: { type: "string" },
    shell: { type: "string" },
    timeoutMs: {
      type: "number",
      description: `run and start: the command is stopped after this long. Defaults to the bridge's timeout (${minutes(LOCAL_EXECUTION_BRIDGE_LIMITS.defaultTimeoutMs)} minutes unless the user changed it), at most ${minutes(LOCAL_EXECUTION_BRIDGE_LIMITS.maxTimeoutMs)} minutes.`,
    },
  }),
  async execute(input, { signal }) {
    const action = stringArg(input.action) || "run";
    const taskId = stringArg(input.taskId);
    if (action === "status" || action === "cancel") {
      if (!taskId) return fail(`taskId is required to ${action}.`);
      const record =
        action === "status"
          ? localCommandStatus(taskId)
          : cancelLocalCommand(taskId);
      const result = taskResult(record, Number(input.offset) || 0);
      return action === "cancel" && record.state === "canceled"
        ? { ...result, isError: false }
        : result;
    }
    const request: LocalCommandRequest = {
      command: stringArg(input.command),
      bridge: stringArg(input.bridge),
      cwd: stringArg(input.cwd),
      shell: stringArg(input.shell),
      timeoutMs: input.timeoutMs,
    };
    if (!request.command) return fail("command is required.");
    const record =
      action === "start"
        ? await startLocalCommand(request)
        : await runLocalCommand(request, signal);
    return taskResult(record, 0);
  },
};

// A task's state and its output after `offset` (characters received so
// far), at most the last OUTPUT_SHOWN of them.
function taskResult(value: unknown, offset: number): ToolResult {
  const record = value as Record<string, unknown>;
  if (record.state === "missing" && !record.taskId)
    return fail(String(record.error || "The command could not start."));
  if (record.state === "missing")
    return fail(`No local command task "${record.taskId}".`);
  const output = String(record.output ?? "");
  const received = Number(record.received) || output.length;
  const unread = output.slice(
    Math.max(0, output.length - Math.max(0, received - offset)),
  );
  const shown = unread.slice(-OUTPUT_SHOWN);
  const lines = [
    `Task ${record.taskId}: ${record.state}${record.error ? ` (${record.error})` : ""}`,
    shown
      ? `Output${shown.length < unread.length ? ` (last ${shown.length} of ${unread.length} new characters)` : ""}:\n${shown}`
      : "No new output.",
    record.result !== undefined
      ? `Result: ${JSON.stringify(record.result)}`
      : "",
    record.state === "running"
      ? `[Still running: status with taskId and offset=${received} for more output, or cancel.]`
      : "",
  ].filter(Boolean);
  return {
    text: lines.join("\n"),
    details: {
      taskId: record.taskId,
      state: record.state,
      error: record.error,
      bridge: (record.bridge as { name?: string })?.name,
      output: shown,
    },
    isError: record.success === false,
  };
}

export const localBridgesTool: ToolDefinition = {
  name: TOOL_NAME.localBridges,
  group: "localExecution",
  onDemand: true,
  summary: "Set up and test local execution bridges",
  description:
    "Manage local execution bridges: list, status, add, update, test, delete. Read skill:local-execution-bridge-setup before setting one up.",
  parameters: schema(
    {
      action: {
        type: "string",
        enum: LOCAL_BRIDGE_ACTIONS,
      },
      bridgeId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      hostName: { type: "string", description: "Native messaging host name." },
      hostAddress: { type: "string" },
      bridgeKey: {
        type: "string",
        description: "Shell config key printed by the bridge installer.",
      },
      secret: { type: "string" },
      defaultCwd: { type: "string" },
      timeoutMs: { type: "number" },
      regenerateSecret: { type: "boolean" },
      test: { type: "boolean", description: "Test right after add or update." },
    },
    ["action"],
  ),
  async execute(input) {
    return json(
      (await runLocalBridgesAction(input)) as Record<string, unknown>,
    );
  },
};
