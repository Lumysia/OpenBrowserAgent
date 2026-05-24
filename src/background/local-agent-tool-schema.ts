import { BROWSER_TOOL_NAME } from "../shared/browser-tools";

export const localExecutionBridgeTools = [
  tool(
    BROWSER_TOOL_NAME.listLocalExecutionBridges,
    "List configured local execution bridges before running local shell commands, using local CLI tools/apps, inspecting local files/drives, delegating to local processes, or managing bridge settings. If the user wants to add, update, test, or delete bridges, read the builtin skill local-execution-bridge-setup first.",
    {},
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.addLocalExecutionBridge,
    "Add a local execution bridge configuration. Before using this tool, read the builtin skill local-execution-bridge-setup and follow it. This creates the extension-side config only; the user still needs a matching Native Messaging host and matching secret in its config.",
    {
      name: {
        type: "string",
        description: "Display name, such as Local or Workstation",
      },
      description: { type: "string", description: "Optional user-facing note" },
      hostName: {
        type: "string",
        description:
          "Native Messaging host name, not a network address. Defaults to openbrowseragent.local_execution_bridge.",
      },
      hostAddress: {
        type: "string",
        description:
          "Optional execution host address passed through to the native bridge. Leave empty for local execution. The extension does not interpret protocols or manage remote credentials.",
      },
      agentKey: {
        type: "string",
        description:
          "Shell bridge config ID inside the native bridge config, such as default.",
      },
      secret: {
        type: "string",
        description:
          "Optional bridge secret. Omit to generate a strong random secret and return it once.",
      },
      defaultCwd: {
        type: "string",
        description: "Optional default working directory",
      },
      timeoutMs: {
        type: "number",
        description: "Optional default timeout in milliseconds",
      },
      test: { type: "boolean", description: "When true, test after adding" },
    },
    ["name"],
  ),
  tool(
    BROWSER_TOOL_NAME.updateLocalExecutionBridge,
    "Update a local execution bridge configuration. Before using this tool, read the builtin skill local-execution-bridge-setup and follow it. Changing hostName, hostAddress, agentKey, or secret clears prior test state until it passes a new test.",
    {
      agentId: { type: "string", description: "Execution bridge ID" },
      name: { type: "string", description: "Display name" },
      description: { type: "string", description: "Optional user-facing note" },
      hostName: { type: "string", description: "Native Messaging host name" },
      hostAddress: {
        type: "string",
        description: "Optional execution host address",
      },
      agentKey: {
        type: "string",
        description: "Shell bridge config ID inside the native bridge config",
      },
      secret: { type: "string", description: "Bridge secret" },
      regenerateSecret: {
        type: "boolean",
        description:
          "When true, generate a new strong bridge secret and return it once",
      },
      defaultCwd: {
        type: "string",
        description: "Optional default working directory",
      },
      timeoutMs: {
        type: "number",
        description: "Optional default timeout in milliseconds",
      },
      test: { type: "boolean", description: "When true, test after updating" },
    },
    ["agentId"],
  ),
  tool(
    BROWSER_TOOL_NAME.testLocalExecutionBridge,
    "Test a local execution bridge connection and return the shell, basic environment, and detected local agent CLIs the bridge can see. Before using this tool as part of setup, read the builtin skill local-execution-bridge-setup and follow it.",
    {
      agentId: { type: "string", description: "Execution bridge ID" },
    },
    ["agentId"],
  ),
  tool(
    BROWSER_TOOL_NAME.deleteLocalExecutionBridge,
    "Delete a local execution bridge configuration. Before using this tool, read the builtin skill local-execution-bridge-setup and confirm the target bridge with the user unless they clearly identified it.",
    {
      agentId: { type: "string", description: "Execution bridge ID" },
    },
    ["agentId"],
  ),
  tool(
    BROWSER_TOOL_NAME.startLocalExecutionBridge,
    "Execute a shell command through a configured local execution bridge. Use this for local CLI tools/apps, filesystem or drive inspection, and external local processes. By default this starts the command, waits for completion, and returns stdout/stderr/result. Set background=true only when you intentionally want to continue before it finishes; then call getLocalExecutionBridgeStatus later.",
    {
      agentId: {
        type: "string",
        description:
          "Target execution bridge id. Call listLocalExecutionBridges first if you need to choose.",
      },
      agentName: {
        type: "string",
        description:
          "Target execution bridge display name when the id is unknown.",
      },
      command: {
        type: "string",
        description:
          "Exact shell command line to execute on the local machine.",
      },
      shell: {
        type: "string",
        description:
          "Optional shell executable or shell mode. Omit to use the shell reported by the bridge test.",
      },
      title: { type: "string", description: "Short task title" },
      cwd: {
        type: "string",
        description:
          "Optional local working directory. Omit to use the configured default for this execution bridge.",
      },
      background: {
        type: "boolean",
        description:
          "When true, return immediately after launching the local task. Omit or set false to wait for the local result before continuing.",
      },
      timeoutMs: {
        type: "number",
        description:
          "Maximum wait duration in milliseconds for the default synchronous mode. Defaults to 60000 and caps at 1800000.",
      },
    },
    ["command"],
  ),
  tool(
    BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus,
    "Check or wait for a local command task started by startLocalExecutionBridge. Use wait=true when you need the local result before answering.",
    {
      taskId: {
        type: "string",
        description: "The task id returned by startLocalExecutionBridge",
      },
      wait: {
        type: "boolean",
        description:
          "When true, wait until the local command finishes or times out",
      },
      timeoutMs: {
        type: "number",
        description:
          "Maximum wait duration in milliseconds. Defaults to 60000.",
      },
    },
    ["taskId"],
  ),
  tool(
    BROWSER_TOOL_NAME.cancelLocalExecutionBridge,
    "Cancel a running local command task started by startLocalExecutionBridge.",
    {
      taskId: {
        type: "string",
        description: "The task id returned by startLocalExecutionBridge",
      },
    },
    ["taskId"],
  ),
];

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}
