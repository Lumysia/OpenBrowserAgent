import type { McpServerConfig, McpToolConfig } from "./mcp";
import { withMcpSession } from "./mcp-transport";

export async function listMcpServerTools(
  server: McpServerConfig,
  signal?: AbortSignal,
) {
  return withMcpSession(
    server,
    async (request) => {
      const tools: McpToolConfig[] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const result = (await request(
          "tools/list",
          cursor ? { cursor } : {},
        )) as Record<string, unknown> | undefined;
        const page = Array.isArray(result?.tools) ? result.tools : [];
        tools.push(
          ...page
            .map(normalizeRemoteTool)
            .filter((tool): tool is McpToolConfig => !!tool),
        );
        cursor =
          typeof result?.nextCursor === "string" && result.nextCursor
            ? result.nextCursor
            : undefined;
        if (cursor && cursors.has(cursor))
          throw new Error("MCP server repeated a pagination cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      if (!tools.length) throw new Error("MCP server returned no tools");
      return tools;
    },
    signal,
  );
}

export async function callMcpServerTool(
  server: McpServerConfig,
  toolName: string,
  argumentsValue: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return withMcpSession(
    server,
    (request) =>
      request("tools/call", {
        name: toolName,
        arguments: argumentsValue,
      }),
    signal,
  );
}

function normalizeRemoteTool(value: unknown): McpToolConfig | null {
  if (!value || typeof value !== "object") return null;
  const tool = value as Record<string, unknown>;
  const name = typeof tool.name === "string" ? tool.name.trim() : "";
  if (!name) return null;
  return {
    name,
    description:
      typeof tool.description === "string" ? tool.description.trim() : "",
    inputSchema:
      tool.inputSchema &&
      typeof tool.inputSchema === "object" &&
      !Array.isArray(tool.inputSchema)
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined,
    enabled: true,
  };
}
