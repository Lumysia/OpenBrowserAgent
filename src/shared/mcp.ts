import { nanoid } from "nanoid";
import { findMcpServerPreset } from "./mcp-presets";
import { readId } from "./read-ids";
import { finiteNumber, isRecord, trimmedString } from "./values";

export type McpServerConfig = {
  id: string;
  name: string;
  description?: string;
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
  // Send requests without the browser's Origin header, for servers that
  // reject browser requests (see mcp-origin-rules).
  omitOrigin: boolean;
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

// Stored for a server saved without a name.
const MCP_SERVER_FALLBACK_NAME = "MCP Server";

export function createMcpServerDraft(
  name = MCP_SERVER_FALLBACK_NAME,
): McpServerConfig {
  const now = Date.now();
  return {
    id: `mcp_${nanoid(8)}`,
    name,
    url: "",
    enabled: false,
    headers: {},
    omitOrigin: false,
    tools: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeMcpServers(value: unknown): McpServerConfig[] {
  return Array.isArray(value)
    ? value
        .map((item, index) => normalizeMcpServer(item, index))
        .filter((item): item is McpServerConfig => !!item)
    : [];
}

// `index`: its place in the stored list, which names it when it has no id;
// without one, a server with no id gets a new one.
export function normalizeMcpServer(
  value: unknown,
  index?: number,
): McpServerConfig | null {
  if (!isRecord(value)) return null;
  const item = value;
  const id =
    index === undefined
      ? trimmedString(item.id) || `mcp_${nanoid(8)}`
      : readId(value, index);
  const createdAt = finiteNumber(item.createdAt, 0);
  return {
    id,
    name: trimmedString(item.name) || MCP_SERVER_FALLBACK_NAME,
    description: trimmedString(item.description),
    url: trimmedString(item.url),
    enabled: item.enabled === true && isMcpServerTested(item),
    headers: normalizeHeaders(item.headers),
    // A preset stored before the field existed keeps the preset's setting.
    omitOrigin:
      typeof item.omitOrigin === "boolean"
        ? item.omitOrigin
        : findMcpServerPreset(id)?.omitOrigin === true,
    tools: normalizeMcpTools(item.tools),
    testedAt: finiteNumber(item.testedAt),
    lastTestError: trimmedString(item.lastTestError),
    createdAt,
    updatedAt: finiteNumber(item.updatedAt, createdAt),
  };
}

export function isMcpServerTested(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    !!finiteNumber(value.testedAt) && normalizeMcpTools(value.tools).length > 0
  );
}

// What decides how the server is reached; changing any needs a new test.
const MCP_CONNECTION_KEYS = ["url", "headers", "omitOrigin"] as const;

export function mcpNeedsRetest(patch: Partial<McpServerConfig>) {
  return MCP_CONNECTION_KEYS.some((key) => key in patch);
}

// A server that has to be tested (again) before it can be turned on.
export function mcpUntestedPatch(lastTestError = "") {
  return {
    enabled: false,
    tools: [],
    testedAt: undefined,
    lastTestError,
  } satisfies Partial<McpServerConfig>;
}

// A server whose test listed `tools`: on, with each tool's earlier choice.
export function mcpTestedPatch(
  server: Pick<McpServerConfig, "tools">,
  tools: McpToolConfig[],
) {
  return {
    enabled: true,
    tools: mergeMcpTools(server.tools || [], tools),
    testedAt: Date.now(),
    lastTestError: "",
  } satisfies Partial<McpServerConfig>;
}

// Newly listed tools, keeping whether the user had each one on.
function mergeMcpTools(existing: McpToolConfig[], next: McpToolConfig[]) {
  const enabledByName = new Map(
    existing.map((tool) => [tool.name, tool.enabled]),
  );
  return next.map((tool) => ({
    ...tool,
    enabled: enabledByName.get(tool.name) ?? tool.enabled,
  }));
}

function normalizeMcpTools(value: unknown): McpToolConfig[] {
  if (!Array.isArray(value)) return [];
  const tools: McpToolConfig[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = trimmedString(item.name);
    if (!name) continue;
    tools.push({
      name,
      description: trimmedString(item.description),
      inputSchema: isRecord(item.inputSchema) ? item.inputSchema : undefined,
      enabled: item.enabled !== false,
    });
  }
  return tools;
}

export function normalizeHeaders(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [key.trim(), trimmedString(headerValue)])
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
      name: trimmedString(object.title || object.name),
      value: item,
    }));
  if (object.url)
    return [
      { name: trimmedString(object.name || object.title), value: object },
    ];
  return objectEntries(object).filter(({ value: item }) => isRecord(item));
}

function normalizeImportedMcpServer(name: string | undefined, value: unknown) {
  if (!isRecord(value)) return null;
  const type = trimmedString(value.type || value.transport).toLowerCase();
  if (type && !["http", "streamable-http", "streamablehttp"].includes(type))
    return null;
  const url = trimmedString(value.url);
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
    createdAt: Date.now(),
  });
}

function objectEntries(value: Record<string, unknown>) {
  return Object.entries(value).map(([name, item]) => ({ name, value: item }));
}

function stripJsonComments(value: string) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}
