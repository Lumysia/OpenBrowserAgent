import type { AgentCapabilities, McpServerConfig } from "../shared/types";
import {
  isMcpServerTested,
  normalizeHeaders,
  normalizeMcpServer,
} from "../shared/mcp";
import { callMcpServerTool, listMcpServerTools } from "../shared/mcp-client";
import { storage } from "../shared/storage";

export function mcpToolsForPrompt(
  capabilities: AgentCapabilities,
  servers: McpServerConfig[],
) {
  if (!capabilities.mcpTools) return [];
  return servers
    .filter((server) => server.enabled && isMcpServerTested(server))
    .flatMap((server) =>
      (server.tools || [])
        .filter((tool) => tool.enabled)
        .map((tool) => ({
          type: "function",
          function: {
            name: mcpToolName(server, tool.name),
            description: [
              tool.description || `Call ${tool.name} on ${server.name}`,
              `MCP server: ${server.name}.`,
            ].join(" "),
            parameters: sanitizeMcpInputSchema(tool.inputSchema),
          },
        })),
    );
}

export async function executeMcpTool(
  toolName: string,
  input: Record<string, unknown>,
) {
  const servers = await storage.mcpServers.get();
  for (const server of servers) {
    if (!server.enabled || !isMcpServerTested(server)) continue;
    const tool = (server.tools || []).find(
      (item) => item.enabled && mcpToolName(server, item.name) === toolName,
    );
    if (!tool) continue;
    try {
      return {
        success: true,
        serverId: server.id,
        serverName: server.name,
        toolName: tool.name,
        result: await callMcpServerTool(server, tool.name, input),
      };
    } catch (error) {
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

export function isMcpToolName(name: string) {
  return name.startsWith("mcp__");
}

function mcpToolName(server: McpServerConfig, toolName: string) {
  return `mcp__${toolSlug(server.name || server.id)}__${toolSlug(toolName)}`;
}

function toolSlug(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tool"
  );
}

function sanitizeMcpInputSchema(value: unknown) {
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

export function manageMcpServers(input: Record<string, unknown>) {
  const operation = stringInput(input.operation || "list");
  if (operation === "list") return listMcpServers();
  if (operation === "add") return addMcpServer(input);
  if (operation === "update") return updateMcpServer(input);
  if (operation === "test") return testMcpServer(input);
  if (operation === "delete") return deleteMcpServer(input);
  return { success: false, error: "Unknown MCP server operation", operation };
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
    await storage.mcpServers.set([...(await storage.mcpServers.get()), next]);
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
  let updated: ReturnType<typeof safeMcpServer> | undefined;
  await storage.mcpServers.set(
    (await storage.mcpServers.get()).map((server) => {
      if (server.id !== serverId) return server;
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
      const needsRetest =
        input.url !== undefined || input.headers !== undefined;
      const canKeepEnabled = !needsRetest && isMcpServerTested(baseNext);
      const next = {
        ...baseNext,
        ...(needsRetest
          ? {
              enabled: false,
              testedAt: undefined,
              tools: [],
              lastTestError: "",
            }
          : {}),
        ...(input.enabled !== undefined
          ? { enabled: input.enabled === true && canKeepEnabled }
          : {}),
      };
      updated = safeMcpServer(next);
      return next;
    }),
  );
  if (!updated) return { success: false, error: "MCP server not found" };
  if (input.enabled === true && !updated.enabled) {
    const tested = await testMcpServer({ serverId });
    return tested.success
      ? updateMcpServer({ serverId, enabled: true })
      : tested;
  }
  return { success: true, server: updated };
}

export async function testMcpServer(input: Record<string, unknown>) {
  const serverId = stringInput(input.serverId || input.id);
  if (!serverId) return { success: false, error: "Missing MCP server ID" };
  let result: ReturnType<typeof safeMcpServer> | undefined;
  let errorMessage = "";
  const servers = await storage.mcpServers.get();
  await storage.mcpServers.set(
    await Promise.all(
      servers.map(async (server) => {
        if (server.id !== serverId) return server;
        try {
          const tools = await listMcpServerTools(server);
          const next = {
            ...server,
            enabled: true,
            tools: mergeMcpTools(server.tools || [], tools),
            testedAt: Date.now(),
            lastTestError: "",
            updatedAt: Date.now(),
          };
          result = safeMcpServer(next);
          return next;
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
          const next = {
            ...server,
            enabled: false,
            tools: [],
            testedAt: undefined,
            lastTestError: errorMessage,
            updatedAt: Date.now(),
          };
          result = safeMcpServer(next);
          return next;
        }
      }),
    ),
  );
  if (!result) return { success: false, error: "MCP server not found" };
  return errorMessage
    ? { success: false, error: errorMessage, server: result }
    : { success: true, server: result };
}

export async function deleteMcpServer(input: Record<string, unknown>) {
  const serverId = stringInput(input.serverId || input.id);
  const servers = await storage.mcpServers.get();
  const next = servers.filter((server) => server.id !== serverId);
  await storage.mcpServers.set(next);
  return { success: next.length !== servers.length, serverId };
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
