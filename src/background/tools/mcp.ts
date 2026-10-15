import { mcpResultSources } from "../../shared/mcp-sources";
import { isMcpServerTested } from "../../shared/mcp";
import { TOOL_NAME } from "../../shared/tool-names";
import type { McpServerConfig } from "../../shared/types";
import {
  executeMcpTool,
  MCP_SERVER_ACTIONS,
  runMcpServersAction,
  mcpToolName,
  sanitizeMcpInputSchema,
} from "../mcp-tools";
import { json, schema, type ToolDefinition } from "./types";

export const mcpServersTool: ToolDefinition = {
  name: TOOL_NAME.mcpServers,
  group: "mcpServers",
  onDemand: true,
  summary: "Add, test and manage MCP servers",
  description:
    "Manage Streamable HTTP MCP servers: list, add (name, url, headers, omitOrigin), update, test (discovers its tools), delete. Tools of tested, enabled servers become loadable with toolSearch in the next chat.",
  parameters: schema(
    {
      action: {
        type: "string",
        enum: MCP_SERVER_ACTIONS,
      },
      serverId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      url: { type: "string" },
      enabled: { type: "boolean" },
      headers: { type: "object" },
      omitOrigin: {
        type: "boolean",
        description:
          "Send requests without the browser Origin header, for servers that reject browser requests.",
      },
    },
    ["action"],
  ),
  async execute(input) {
    return json((await runMcpServersAction(input)) as Record<string, unknown>);
  },
};

// Each enabled tool of a tested MCP server, loadable on demand.
export function mcpToolDefinitions(
  servers: McpServerConfig[],
): ToolDefinition[] {
  return servers
    .filter((server) => server.enabled && isMcpServerTested(server))
    .flatMap((server) =>
      (server.tools || [])
        .filter((tool) => tool.enabled)
        .map((tool): ToolDefinition => {
          const description =
            tool.description || `${tool.name} on ${server.name}`;
          return {
            name: mcpToolName(server, tool.name),
            group: "mcp",
            onDemand: true,
            summary: `${server.name}: ${description.split("\n")[0].slice(0, 120)}`,
            description: `${description} (MCP server ${server.name})`,
            parameters: sanitizeMcpInputSchema(tool.inputSchema),
            async execute(input, { signal }) {
              const name = mcpToolName(server, tool.name);
              const output = (await executeMcpTool(
                name,
                input,
                signal,
              )) as Record<string, unknown>;
              return { ...json(output), sources: mcpResultSources(output) };
            },
          };
        }),
    );
}
