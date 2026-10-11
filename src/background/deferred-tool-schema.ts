import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import { MEMORY_ENTRY_TEXT_MAX_CHARS } from "../shared/config";
import { localExecutionBridgeTools } from "./local-execution-bridge-tool-schema";
import {
  contentSliceParameters,
  listSliceParameters,
  tool,
} from "./tool-schema-helpers";

export const deferredDomainTools = [
  tool(
    BROWSER_TOOL_NAME.startSubAgent,
    "Delegate a focused task to another internal OpenBrowserAgent chat agent profile.",
    {
      agentId: { type: "string" },
      agentName: { type: "string" },
      task: { type: "string" },
      title: { type: "string" },
      background: { type: "boolean" },
      timeoutMs: { type: "number" },
    },
    ["task"],
  ),
  tool(
    BROWSER_TOOL_NAME.getSubAgentStatus,
    "Check or wait for a sub-agent task started by startSubAgent.",
    {
      taskId: { type: "string" },
      wait: { type: "boolean" },
      timeoutMs: { type: "number" },
    },
    ["taskId"],
  ),
  ...localExecutionBridgeTools,
  tool(
    BROWSER_TOOL_NAME.manageSkills,
    "List, create, read, read supporting files, update files, or patch available skill packages. For operation=list, no fields are required. For read, pass skillId and optionally offset/limit to page long skill text. For readFile/updateFile/patchFile, pass skillId and path.",
    {
      operation: {
        type: "string",
        enum: ["list", "create", "read", "readFile", "updateFile", "patchFile"],
        description: "Defaults to list.",
      },
      skillId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      instruction: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
      replacements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            oldText: { type: "string", minLength: 1 },
            newText: { type: "string" },
          },
          required: ["oldText", "newText"],
        },
      },
      reason: { type: "string" },
      ...contentSliceParameters,
      ...listSliceParameters,
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.workspaceFiles,
    "List, read, write, patch, delete, or search private current-agent workspace files.",
    {
      operation: {
        type: "string",
        enum: ["list", "read", "write", "patch", "delete", "search"],
      },
      path: { type: "string" },
      content: { type: "string" },
      patchOperation: {
        type: "string",
        enum: ["replace", "append", "prepend"],
        description:
          "For operation=patch. Defaults to replace; find selects literal text, or omit find to replace the whole file.",
      },
      value: { type: "string" },
      find: { type: "string" },
      query: { type: "string" },
      ...contentSliceParameters,
      ...listSliceParameters,
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.manageMemory,
    "List, add, update, or remove long-term memory entries or user profile notes.",
    {
      operation: { type: "string", enum: ["list", "add", "update", "remove"] },
      scope: { type: "string", enum: ["memory", "user"] },
      id: { type: "string" },
      text: {
        type: "string",
        description: `Durable text, normalized to at most ${MEMORY_ENTRY_TEXT_MAX_CHARS} characters`,
      },
      ...listSliceParameters,
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.manageChatHistory,
    "Search, read, or delete saved chat history.",
    {
      operation: { type: "string", enum: ["search", "read", "delete"] },
      query: { type: "string" },
      chatId: { type: "string" },
      offset: { type: "number" },
      limit: { type: "number" },
    },
    [],
  ),
  tool(
    BROWSER_TOOL_NAME.manageMcpServers,
    "List, add, update, test, or delete configured Streamable HTTP MCP servers.",
    {
      operation: {
        type: "string",
        enum: ["list", "add", "update", "test", "delete"],
      },
      serverId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      url: { type: "string" },
      enabled: { type: "boolean" },
      headers: { type: "object" },
    },
    [],
  ),
];
