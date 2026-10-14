import type { McpServerConfig } from "./mcp";

// Hosted search servers that work without an API key, offered on the MCP
// settings page; the user adds the ones they want. Added servers start off,
// since each sends queries to a third party. A key raises the free rate
// limit. Ids are stable: added servers keep them, and up to 0.2.0-beta.8
// every list showed every preset (see storage-migrations.ts).
export type McpServerPreset = Pick<
  McpServerConfig,
  "id" | "name" | "url" | "description" | "headers" | "omitOrigin"
>;

export const MCP_SERVER_PRESETS: readonly McpServerPreset[] = [
  preset(
    "exa",
    "https://mcp.exa.ai/mcp",
    "Web search and webpage content extraction.",
  ),
  preset(
    "parallel",
    "https://search.parallel.ai/mcp",
    "Web search with excerpts, and webpage fetching.",
  ),
  preset(
    "tinyfish",
    "https://agent.tinyfish.ai/mcp",
    "Web and news search.",
    // Without a key, the server needs this header to allow keyless use.
    { "X-TinyFish-Access-Mode": "keyless" },
    // It rejects any request that carries an Origin header.
    true,
  ),
  preset(
    "firecrawl",
    "https://mcp.firecrawl.dev/v2/mcp",
    "Web search, webpage scraping and document parsing. Low free rate limit.",
  ),
];

function preset(
  name: string,
  url: string,
  description: string,
  headers: Record<string, string> = {},
  omitOrigin = false,
): McpServerPreset {
  return { id: `builtin_${name}`, name, url, description, headers, omitOrigin };
}

export function findMcpServerPreset(id: string) {
  return MCP_SERVER_PRESETS.find((item) => item.id === id);
}

// The server a preset adds: off and untested, like a new server.
export function mcpServerFromPreset(
  item: McpServerPreset,
  now = Date.now(),
): McpServerConfig {
  return {
    ...item,
    headers: { ...item.headers },
    enabled: false,
    tools: [],
    createdAt: now,
    updatedAt: now,
  };
}

// The presets `servers` does not hold yet.
export function missingMcpServerPresets(servers: McpServerConfig[]) {
  const ids = new Set(servers.map((server) => server.id));
  return MCP_SERVER_PRESETS.filter((item) => !ids.has(item.id));
}
