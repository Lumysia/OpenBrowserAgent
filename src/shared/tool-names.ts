// Tool names are part of the side panel/background protocol: the side panel
// renders tool parts by these names.
export const TOOL_NAME = {
  tabs: "tabs",
  snapshot: "snapshot",
  find: "find",
  read: "read",
  extract: "extract",
  act: "act",
  editPage: "editPage",
  webSearch: "webSearch",
  screenshot: "screenshot",
  ask: "ask",
  toolSearch: "toolSearch",
  export: "export",
  skills: "skills",
  workspace: "workspace",
  chatHistory: "chatHistory",
  subAgent: "subAgent",
  mcpServers: "mcpServers",
  localCommand: "localCommand",
  localBridges: "localBridges",
  generateImage: "generateImage",
  runScript: "runScript",
  devtools: "devtools",
} as const;

export const MCP_TOOL_PREFIX = "mcp__";

export function isMcpToolName(name: string) {
  return name.startsWith(MCP_TOOL_PREFIX);
}
