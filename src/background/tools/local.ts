import { TOOL_NAME } from "../../shared/tool-names";
import { runLocalCommand } from "../local-execution-bridge-tasks";
import { manageLocalExecutionBridges } from "../local-execution-bridge-tools";
import { fail, json, schema, stringArg, type ToolDefinition } from "./types";

export const localCommandTool: ToolDefinition = {
  name: TOOL_NAME.localCommand,
  group: "localExecution",
  onDemand: true,
  summary: "Run a shell command on the user's computer through a local bridge",
  description:
    "Run one shell command on the user's computer through a configured, tested local execution bridge and wait for it to finish (stopping the chat cancels it). Returns the output and result.",
  parameters: schema(
    {
      command: { type: "string", description: "Exact shell command line." },
      bridge: {
        type: "string",
        description: "Bridge id or name. Defaults to the first bridge.",
      },
      cwd: { type: "string" },
      shell: { type: "string" },
      timeoutMs: {
        type: "number",
        description: "Defaults to 10 minutes, at most 30.",
      },
    },
    ["command"],
  ),
  async execute(input, { run, toolCallId, messageId, signal }) {
    if (!stringArg(input.command)) return fail("command is required.");
    const bridge = stringArg(input.bridge);
    const result = await runLocalCommand(
      { ...input, bridgeId: bridge, bridgeName: bridge },
      { chatId: run.chatId, messageId, toolCallId },
      run.workspace,
      signal,
    );
    const record = result as Record<string, unknown>;
    const output = String(record.output ?? "");
    const lines = [
      `State: ${record.state}${record.error ? ` (${record.error})` : ""}`,
      output ? `Output:\n${output}` : "No output.",
      record.result !== undefined
        ? `Result: ${JSON.stringify(record.result)}`
        : "",
    ].filter(Boolean);
    return {
      text: lines.join("\n"),
      details: {
        state: record.state,
        error: record.error,
        bridge: (record.bridge as { name?: string })?.name,
        output: output.slice(-4000),
      },
      isError: record.success === false,
    };
  },
};

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
        enum: ["list", "status", "add", "update", "test", "delete"],
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
      (await manageLocalExecutionBridges(input)) as Record<string, unknown>,
    );
  },
};
