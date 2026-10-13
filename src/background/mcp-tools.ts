import { MCP_TOOL_PREFIX } from "../shared/tool-names";
import type { McpServerConfig } from "../shared/types";
import {
  isMcpServerTested,
  normalizeHeaders,
  normalizeMcpServer,
} from "../shared/mcp";
import { callMcpServerTool, listMcpServerTools } from "../shared/mcp-client";
import { removeById, storage, updateById } from "../shared/storage";
import { sameJson } from "../shared/sync/codec";

export async function executeMcpTool(
  toolName: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const servers = await storage.mcpServers.get();
  for (const server of servers) {
    if (!server.enabled || !isMcpServerTested(server)) continue;
    const tool = (server.tools || []).find(
      (item) => item.enabled && mcpToolName(server, item.name) === toolName,
    );
    if (!tool) continue;
    try {
      const result = await callMcpServerTool(server, tool.name, input, signal);
      return {
        success: !(
          result &&
          typeof result === "object" &&
          "isError" in result &&
          result.isError === true
        ),
        serverId: server.id,
        serverName: server.name,
        toolName: tool.name,
        result,
      };
    } catch (error) {
      signal?.throwIfAborted();
      return {
        success: false,
        serverId: server.id,
        serverName: server.name,
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    success: false,
    error: "MCP tool is not enabled or no longer exists",
  };
}

export function mcpToolName(server: McpServerConfig, toolName: string) {
  return `${MCP_TOOL_PREFIX}${toolSlug(server.name || server.id)}__${toolSlug(toolName)}`;
}

function toolSlug(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tool"
  );
}

export function sanitizeMcpInputSchema(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { type: "object", properties: {}, required: [] };
  const schema = value as Record<string, unknown>;
  if (schema.type !== "object")
    return { ...schema, type: "object", properties: {}, required: [] };
  return {
    ...schema,
    properties:
      schema.properties && typeof schema.properties === "object"
        ? schema.properties
        : {},
    required: Array.isArray(schema.required) ? schema.required : [],
  };
}

export async function listMcpServers() {
  const servers = await storage.mcpServers.get();
  return {
    servers: servers.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description,
      url: server.url,
      enabled: server.enabled,
      tested: isMcpServerTested(server),
      tools: server.tools || [],
      headerNames: Object.keys(server.headers || {}),
    })),
  };
}

export function runMcpServersAction(input: Record<string, unknown>) {
  const action = stringInput(input.action || "list");
  if (action === "list") return listMcpServers();
  if (action === "add") return addMcpServer(input);
  if (action === "update") return updateMcpServer(input);
  if (action === "test") return testMcpServer(input);
  if (action === "delete") return deleteMcpServer(input);
  return { success: false, error: "Unknown MCP server action", action };
}

export async function addMcpServer(input: Record<string, unknown>) {
  const server = normalizeMcpServer({
    name: input.name,
    description: input.description,
    url: input.url,
    enabled: false,
    headers: input.headers,
  });
  if (!server?.url) return { success: false, error: "Missing MCP server URL" };
  try {
    const tools = await listMcpServerTools(server);
    const next = {
      ...server,
      enabled: input.enabled !== false,
      tools,
      testedAt: Date.now(),
      lastTestError: "",
      updatedAt: Date.now(),
    };
    await storage.mcpServers.update((servers) => [...servers, next]);
    return { success: true, server: safeMcpServer(next) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function updateMcpServer(
  input: Record<string, unknown>,
): Promise<unknown> {
  const serverId = stringInput(input.serverId || input.id);
  if (!serverId) return { success: false, error: "Missing MCP server ID" };
  const next = await updateById(storage.mcpServers, serverId, (server) => {
    const baseNext = {
      ...server,
      ...(input.name !== undefined ? { name: stringInput(input.name) } : {}),
      ...(input.description !== undefined
        ? { description: stringInput(input.description) }
        : {}),
      ...(input.url !== undefined ? { url: stringInput(input.url) } : {}),
      ...(input.headers !== undefined
        ? { headers: normalizeHeaders(input.headers) }
        : {}),
      updatedAt: Date.now(),
    };
    const needsRetest = input.url !== undefined || input.headers !== undefined;
    const canKeepEnabled = !needsRetest && isMcpServerTested(baseNext);
    return {
      ...baseNext,
      ...(needsRetest
        ? { enabled: false, testedAt: undefined, tools: [], lastTestError: "" }
        : {}),
      ...(input.enabled !== undefined
        ? { enabled: input.enabled === true && canKeepEnabled }
        : {}),
    };
  });
  if (!next) return { success: false, error: "MCP server not found" };
  const updated = safeMcpServer(next);
  if (input.enabled === true && !updated.enabled) {
    const tested = await testMcpServer({ serverId });
    return tested.success
      ? updateMcpServer({ serverId, enabled: true })
      : tested;
  }
  return { success: true, server: updated };
}

const sameEndpoint = (left: McpServerConfig, right: McpServerConfig) =>
  left.url === right.url && sameJson(left.headers, right.headers);

// The server is asked first; its answer is stored on the server as stored
// then, unless its address or headers changed meanwhile.
export async function testMcpServer(input: Record<string, unknown>) {
  const serverId = stringInput(input.serverId || input.id);
  if (!serverId) return { success: false, error: "Missing MCP server ID" };
  const server = (await storage.mcpServers.get()).find(
    (item) => item.id === serverId,
  );
  if (!server) return { success: false, error: "MCP server not found" };
  let tools: Awaited<ReturnType<typeof listMcpServerTools>> | undefined;
  let errorMessage = "";
  try {
    tools = await listMcpServerTools(server);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  const next = await updateById(storage.mcpServers, serverId, (current) => {
    if (!sameEndpoint(current, server)) return current;
    return tools
      ? {
          ...current,
          enabled: true,
          tools: mergeMcpTools(current.tools || [], tools),
          testedAt: Date.now(),
          lastTestError: "",
          updatedAt: Date.now(),
        }
      : {
          ...current,
          enabled: false,
          tools: [],
          testedAt: undefined,
          lastTestError: errorMessage,
          updatedAt: Date.now(),
        };
  });
  if (!next) return { success: false, error: "MCP server not found" };
  if (!sameEndpoint(next, server))
    return {
      success: false,
      error: "The MCP server's address or headers changed during the test",
      server: safeMcpServer(next),
    };
  const result = safeMcpServer(next);
  return errorMessage
    ? { success: false, error: errorMessage, server: result }
    : { success: true, server: result };
}

export async function deleteMcpServer(input: Record<string, unknown>) {
  const serverId = stringInput(input.serverId || input.id);
  const success = await removeById(storage.mcpServers, serverId);
  return { success, serverId };
}

function safeMcpServer(server: {
  id: string;
  name: string;
  description?: string;
  url: string;
  enabled: boolean;
  headers?: Record<string, string>;
  tools?: Array<{ name: string; description?: string; enabled: boolean }>;
  testedAt?: number;
  lastTestError?: string;
}) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    url: server.url,
    enabled: server.enabled,
    tested: isMcpServerTested(server),
    tools: server.tools || [],
    lastTestError: server.lastTestError,
    headerNames: Object.keys(server.headers || {}),
  };
}

function mergeMcpTools(
  existing: NonNullable<Parameters<typeof listMcpServerTools>[0]["tools"]>,
  next: NonNullable<Parameters<typeof listMcpServerTools>[0]["tools"]>,
) {
  const enabledByName = new Map(
    existing.map((tool) => [tool.name, tool.enabled]),
  );
  return next.map((tool) => ({
    ...tool,
    enabled: enabledByName.get(tool.name) ?? tool.enabled,
  }));
}

function stringInput(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
