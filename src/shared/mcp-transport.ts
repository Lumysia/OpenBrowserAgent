import type { McpServerConfig } from "./mcp";

const MCP_PROTOCOL_VERSION = "2025-06-18";
type RpcResponse = {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: unknown;
};

export async function openMcpSession(
  server: McpServerConfig,
  signal?: AbortSignal,
) {
  let sessionId: string | undefined;
  const headers = () => ({
    ...server.headers,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  });
  async function send(body: object) {
    signal?.throwIfAborted();
    const response = await fetch(server.url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${response.status} ${response.statusText}`);
    }
    sessionId = response.headers.get("Mcp-Session-Id") || sessionId;
    return response;
  }
  async function request(method: string, params: Record<string, unknown>) {
    const id = crypto.randomUUID();
    const response = await send({ jsonrpc: "2.0", id, method, params });
    const body = await readRpcResponse(response, id);
    if ("error" in body) throw new Error(formatMcpError(body.error));
    return body.result;
  }
  await request("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "OpenBrowserAgent", version: "0.1.0" },
  });
  const initialized = await send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  await initialized.body?.cancel();
  return { request };
}

async function readRpcResponse(
  response: Response,
  id: string,
): Promise<RpcResponse> {
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("text/event-stream")
  ) {
    const value: unknown = await response.json();
    if (!isResponse(value, id))
      throw new Error("MCP server returned an invalid or mismatched response");
    return value;
  }
  if (!response.body)
    throw new Error("MCP server returned an empty event stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer))) {
        // A CRLF can straddle network chunks.
        if (!done && match[0] === "\r" && match.index === buffer.length - 1)
          break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (!line) {
          const payload = data.join("\n");
          data = [];
          if (!payload || payload === "[DONE]") continue;
          const message: unknown = JSON.parse(payload);
          if (isResponse(message, id)) return message;
        } else if (line === "data" || line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (done)
        throw new Error("MCP event stream ended without a matching response");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function isResponse(value: unknown, id: string): value is RpcResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return (
    response.jsonrpc === "2.0" &&
    response.id === id &&
    "result" in response !== "error" in response
  );
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
