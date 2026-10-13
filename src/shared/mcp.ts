import { nanoid } from "nanoid";
import { readId } from "./read-ids";

export type McpServerConfig = {
  id: string;
  name: string;
  description?: string;
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
  tools?: McpToolConfig[];
  testedAt?: number;
  lastTestError?: string;
  createdAt: number;
  updatedAt: number;
};

export type McpToolConfig = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  enabled: boolean;
};

// Hosted search servers that work without an API key (the same backends
// OpenCode uses for its web search). Off until the user turns one on, since
// each sends queries to a third party. A key raises the free rate limit.
export const BUILTIN_MCP_SERVERS: McpServerConfig[] = [
  builtinMcpServer(
    "exa",
    "https://mcp.exa.ai/mcp",
    "Web search and webpage content extraction.",
  ),
  builtinMcpServer(
    "parallel",
    "https://search.parallel.ai/mcp",
    "Web search with excerpts, and webpage fetching.",
  ),
  builtinMcpServer(
    "tinyfish",
    "https://agent.tinyfish.ai/mcp",
    "Web and news search.",
    // Without a key, the server needs this header to allow keyless use.
    { "X-TinyFish-Access-Mode": "keyless" },
  ),
  builtinMcpServer(
    "firecrawl",
    "https://mcp.firecrawl.dev/v2/mcp",
    "Web search, webpage scraping and document parsing. Low free rate limit.",
  ),
];

function builtinMcpServer(
  name: string,
  url: string,
  description: string,
  headers: Record<string, string> = {},
): McpServerConfig {
  return {
    id: `builtin_${name}`,
    name,
    description,
    url,
    enabled: false,
    headers,
    tools: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

export function createMcpServerDraft(name = "MCP Server"): McpServerConfig {
  const now = Date.now();
  return {
    id: `mcp_${nanoid(8)}`,
    name,
    url: "",
    enabled: false,
    headers: {},
    tools: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeMcpServers(value: unknown): McpServerConfig[] {
  const normalized = Array.isArray(value)
    ? value
        .map((item, index) => normalizeMcpServer(item, index))
        .filter((item): item is McpServerConfig => !!item)
    : [];
  return mergeBuiltinMcpServers(normalized);
}

// `index`: its place in the stored list, which names it when it has no id;
// without one, a server with no id gets a new one.
export function normalizeMcpServer(
  value: unknown,
  index?: number,
): McpServerConfig | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id =
    index === undefined
      ? stringValue(item.id) || `mcp_${nanoid(8)}`
      : readId(value, index);
  const now = Date.now();
  return {
    id,
    name: stringValue(item.name) || "MCP Server",
    description: stringValue(item.description),
    url: stringValue(item.url),
    enabled: item.enabled === true && isMcpServerTested(item),
    headers: normalizeHeaders(item.headers),
    tools: normalizeMcpTools(item.tools),
    testedAt: numberValue(item.testedAt),
    lastTestError: stringValue(item.lastTestError),
    createdAt: numberValue(item.createdAt) || now,
    updatedAt: numberValue(item.updatedAt) || now,
  };
}

export function isMcpServerTested(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    !!numberValue(item.testedAt) && normalizeMcpTools(item.tools).length > 0
  );
}

export function normalizeMcpTools(value: unknown): McpToolConfig[] {
  if (!Array.isArray(value)) return [];
  const tools: McpToolConfig[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = stringValue(item.name);
    if (!name) continue;
    tools.push({
      name,
      description: stringValue(item.description),
      inputSchema: isRecord(item.inputSchema) ? item.inputSchema : undefined,
      enabled: item.enabled !== false,
    });
  }
  return tools;
}

export function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, headerValue]) => [key.trim(), stringValue(headerValue)])
      .filter(([key, headerValue]) => key && headerValue),
  );
}

export function parseHeadersJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  return normalizeHeaders(JSON.parse(trimmed));
}

export function stringifyHeaders(value: Record<string, string> | undefined) {
  const headers = normalizeHeaders(value);
  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : "";
}

export function importMcpServersFromJson(text: string) {
  const parsed = JSON.parse(stripJsonComments(text));
  const candidates = collectMcpServerCandidates(parsed);
  const servers = candidates
    .map(({ name, value }) => normalizeImportedMcpServer(name, value))
    .filter((server): server is McpServerConfig => !!server);
  return { servers, skipped: candidates.length - servers.length };
}

function collectMcpServerCandidates(value: unknown): Array<{
  name?: string;
  value: unknown;
}> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.map((item) => ({ value: item }));
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.mcpServers))
    return object.mcpServers.map((item) => ({ value: item }));
  if (isRecord(object.mcpServers)) return objectEntries(object.mcpServers);
  if (isRecord(object.servers)) return objectEntries(object.servers);
  if (isRecord(object.context_servers))
    return objectEntries(object.context_servers);
  if (Array.isArray(object.remotes))
    return object.remotes.map((item) => ({
      name: stringValue(object.title || object.name),
      value: item,
    }));
  if (object.url)
    return [{ name: stringValue(object.name || object.title), value: object }];
  return objectEntries(object).filter(({ value: item }) => isRecord(item));
}

function normalizeImportedMcpServer(name: string | undefined, value: unknown) {
  if (!isRecord(value)) return null;
  const type = stringValue(value.type || value.transport).toLowerCase();
  if (type && !["http", "streamable-http", "streamablehttp"].includes(type))
    return null;
  const url = stringValue(value.url);
  if (!/^https?:\/\//i.test(url)) return null;
  const headers = normalizeHeaders(
    value.headers ||
      (isRecord(value.requestOptions)
        ? value.requestOptions.headers
        : undefined),
  );
  return normalizeMcpServer({
    name: name || value.name || value.title,
    description: value.description,
    url,
    enabled: value.disabled === true ? false : value.enabled,
    headers,
  });
}

// As reading them gives them: a save that leaves one alone does not change it.
const BUILTINS = BUILTIN_MCP_SERVERS.map((server) =>
  normalizeMcpServer(server)!,
);

// A built-in the list lacks goes after the built-in before it (else before
// the first stored built-in, else first), so a list that stores only some of
// them reads back in the order it was shown in. Saves leave built-ins the
// user did not change unstored (see keepStoredForm).
function mergeBuiltinMcpServers(servers: McpServerConfig[]) {
  const result = [...servers];
  let index = -1;
  for (const builtin of BUILTINS) {
    const at = result.findIndex((server) => server.id === builtin.id);
    if (at >= 0) index = at;
    else if (index >= 0) result.splice(++index, 0, builtin);
  }
  const ids = new Set(result.map((server) => server.id));
  const leading = BUILTINS.filter((builtin) => !ids.has(builtin.id));
  const first = result.findIndex((server) =>
    BUILTIN_MCP_SERVERS.some((builtin) => builtin.id === server.id),
  );
  result.splice(Math.max(first, 0), 0, ...leading);
  return result;
}

function objectEntries(value: Record<string, unknown>) {
  return Object.entries(value).map(([name, item]) => ({ name, value: item }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stripJsonComments(value: string) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
