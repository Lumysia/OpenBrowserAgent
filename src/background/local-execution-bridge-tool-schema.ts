import { BROWSER_TOOL_NAME } from "../shared/browser-tools";

export const localExecutionBridgeTools = [
  tool(
    BROWSER_TOOL_NAME.manageLocalExecutionBridges,
    "List, inspect status, add, update, test, or delete local execution bridge configurations. Read local-execution-bridge setup guidance before add/update/test/delete setup work.",
    {
      operation: {
        type: "string",
        enum: ["list", "status", "add", "update", "test", "delete"],
        description: "Bridge management operation. Defaults to list.",
      },
      bridgeId: { type: "string", description: "Execution bridge ID" },
      name: { type: "string", description: "Display name" },
      description: { type: "string", description: "Optional user-facing note" },
      hostName: { type: "string", description: "Native Messaging host name" },
      hostAddress: {
        type: "string",
        description: "Optional execution host address",
      },
      bridgeKey: {
        type: "string",
        description:
          "Shell config key printed by the native bridge setup. Required for a usable bridge; list/status do not need it.",
      },
      secret: { type: "string", description: "Optional bridge secret" },
      defaultCwd: {
        type: "string",
        description: "Optional default working directory",
      },
      timeoutMs: {
        type: "number",
        description: "Optional default timeout in milliseconds",
      },
      regenerateSecret: {
        type: "boolean",
        description:
          "For update, generate a new strong bridge secret and return it once",
      },
      test: {
        type: "boolean",
        description:
          "When true, test native host and shell config connectivity after add/update",
      },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.startLocalExecutionBridge,
    "Execute a shell command through a configured local execution bridge. Use this for local CLI tools/apps, filesystem or drive inspection, and external local processes. By default this starts the command, waits for completion, and returns stdout/stderr/result. Set background=true only when you intentionally want to continue before it finishes; then call getLocalExecutionBridgeStatus later.",
    {
      bridgeId: {
        type: "string",
        description:
          "Target execution bridge id. Call manageLocalExecutionBridges operation=list first if you need to choose.",
      },
      bridgeName: {
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
        description: "Optional shell executable or shell mode.",
      },
      title: { type: "string", description: "Short task title" },
      cwd: { type: "string", description: "Optional local working directory." },
      background: {
        type: "boolean",
        description: "Return immediately after launching the local task.",
      },
      timeoutMs: {
        type: "number",
        description: "Maximum wait duration in milliseconds.",
      },
    },
    ["command"],
  ),
  tool(
    BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus,
    "Check or wait for a local command task started by startLocalExecutionBridge.",
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
        description: "Maximum wait duration in milliseconds.",
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
      parameters: { type: "object", properties, required },
    },
  };
}
