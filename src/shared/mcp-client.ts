import type { McpServerConfig, McpToolConfig } from "./mcp";

const MCP_PROTOCOL_VERSION = "2025-06-18";

export async function listMcpServerTools(server: McpServerConfig) {
  const session = await sendMcpRequest(server, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "OpenBrowserAgent", version: "0.1.0" },
  });
  await sendMcpNotification(
    server,
    "notifications/initialized",
    session.sessionId,
  );
  const response = await sendMcpRequest(
    server,
    "tools/list",
    {},
    session.sessionId,
  );
  const result = response.body.result as Record<string, unknown> | undefined;
  const tools: unknown[] = Array.isArray(result?.tools) ? result.tools : [];
  const normalizedTools = tools
    .map((tool) => normalizeRemoteTool(tool))
    .filter((tool): tool is McpToolConfig => !!tool);
  if (!normalizedTools.length) throw new Error("MCP server returned no tools");
  return normalizedTools;
}

export async function callMcpServerTool(
  server: McpServerConfig,
  toolName: string,
  argumentsValue: Record<string, unknown>,
) {
  const session = await sendMcpRequest(server, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "OpenBrowserAgent", version: "0.1.0" },
  });
  await sendMcpNotification(
    server,
    "notifications/initialized",
    session.sessionId,
  );
  const response = await sendMcpRequest(
    server,
    "tools/call",
    { name: toolName, arguments: argumentsValue },
    session.sessionId,
  );
  return response.body.result;
}

async function sendMcpRequest(
  server: McpServerConfig,
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
) {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      ...(server.headers || {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const body = await parseMcpResponse(response);
  if (body.error) throw new Error(formatMcpError(body.error));
  return {
    body,
    sessionId: response.headers.get("Mcp-Session-Id") || sessionId,
  };
}

async function sendMcpNotification(
  server: McpServerConfig,
  method: string,
  sessionId?: string,
) {
  const response = await fetch(server.url, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      ...(server.headers || {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method }),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
}

async function parseMcpResponse(response: Response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const message = text
      .split(/\r?\n\r?\n/)
      .flatMap((event) =>
        event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart()),
      )
      .find((line) => line && line !== "[DONE]");
    if (!message) throw new Error("MCP server returned an empty event stream");
    return JSON.parse(message);
  }
  return text ? JSON.parse(text) : {};
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
      tool.inputSchema && typeof tool.inputSchema === "object"
        ? (tool.inputSchema as Record<string, unknown>)
        : undefined,
    enabled: true,
  };
}

function formatMcpError(value: unknown) {
  if (!value || typeof value !== "object") return String(value);
  const error = value as Record<string, unknown>;
  const message =
    typeof error.message === "string" ? error.message : "MCP error";
  return typeof error.code === "number"
    ? `${message} (${error.code})`
    : message;
}
