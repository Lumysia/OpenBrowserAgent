import { MCP_TOOL_PREFIX } from "../shared/tool-names";
import type { McpServerConfig } from "../shared/types";
import { errorMessage } from "../shared/error-message";
import {
  isMcpServerTested,
  mcpNeedsRetest,
  mcpTestedPatch,
  mcpUntestedPatch,
  normalizeHeaders,
  normalizeMcpServer,
} from "../shared/mcp";
import { trimmedString } from "../shared/values";
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
        error: errorMessage(error),
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

async function listMcpServers() {
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

type Input = Record<string, unknown>;

const ACTIONS: Record<string, (input: Input) => Promise<unknown>> = {
  list: listMcpServers,
  add: addMcpServer,
  update: updateMcpServer,
  test: testMcpServer,
  delete: deleteMcpServer,
};
export const MCP_SERVER_ACTIONS = Object.keys(ACTIONS);

export function runMcpServersAction(input: Input) {
  const action = trimmedString(input.action) || "list";
  return (
    ACTIONS[action]?.(input) ??
    Promise.resolve({
      success: false,
      error: "Unknown MCP server action",
      action,
    })
  );
}

async function addMcpServer(input: Input) {
  const server = normalizeMcpServer({
    name: input.name,
    description: input.description,
    url: input.url,
    enabled: false,
    headers: input.headers,
    omitOrigin: input.omitOrigin === true,
    createdAt: Date.now(),
  });
  if (!server?.url) return { success: false, error: "Missing MCP server URL" };
  try {
    const tools = await listMcpServerTools(server);
    const next = {
      ...server,
      ...mcpTestedPatch(server, tools),
      enabled: input.enabled !== false,
    };
    await storage.mcpServers.update((servers) => [...servers, next]);
    return { success: true, server: safeMcpServer(next) };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

async function updateMcpServer(input: Input): Promise<unknown> {
  const serverId = trimmedString(input.serverId || input.id);
  if (!serverId) return { success: false, error: "Missing MCP server ID" };
  const patch: Partial<McpServerConfig> = {
    ...(input.name !== undefined ? { name: trimmedString(input.name) } : {}),
    ...(input.description !== undefined
      ? { description: trimmedString(input.description) }
      : {}),
    ...(input.url !== undefined ? { url: trimmedString(input.url) } : {}),
    ...(input.headers !== undefined
      ? { headers: normalizeHeaders(input.headers) }
      : {}),
    ...(input.omitOrigin !== undefined
      ? { omitOrigin: input.omitOrigin === true }
      : {}),
  };
  const needsRetest = mcpNeedsRetest(patch);
  const next = await updateById(storage.mcpServers, serverId, (server) => {
    const baseNext = { ...server, ...patch, updatedAt: Date.now() };
    const canKeepEnabled = !needsRetest && isMcpServerTested(baseNext);
    return {
      ...baseNext,
      ...(needsRetest ? mcpUntestedPatch() : {}),
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
  left.url === right.url &&
  left.omitOrigin === right.omitOrigin &&
  sameJson(left.headers, right.headers);

// The server is asked first; its answer is stored on the server as stored
// then, unless its address or headers changed meanwhile.
export async function testMcpServer(input: Input) {
  const serverId = trimmedString(input.serverId || input.id);
  if (!serverId) return { success: false, error: "Missing MCP server ID" };
  const server = (await storage.mcpServers.get()).find(
    (item) => item.id === serverId,
  );
  if (!server) return { success: false, error: "MCP server not found" };
  let tools: Awaited<ReturnType<typeof listMcpServerTools>> | undefined;
  let failure = "";
  try {
    tools = await listMcpServerTools(server);
  } catch (error) {
    failure = errorMessage(error);
  }
  const next = await updateById(storage.mcpServers, serverId, (current) => {
    if (!sameEndpoint(current, server)) return current;
    return {
      ...current,
      ...(tools ? mcpTestedPatch(current, tools) : mcpUntestedPatch(failure)),
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
  return failure
    ? { success: false, error: failure, server: result }
    : { success: true, server: result };
}

async function deleteMcpServer(input: Input) {
  const serverId = trimmedString(input.serverId || input.id);
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
  omitOrigin?: boolean;
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
    omitOrigin: server.omitOrigin === true,
    tested: isMcpServerTested(server),
    tools: server.tools || [],
    lastTestError: server.lastTestError,
    headerNames: Object.keys(server.headers || {}),
  };
}
