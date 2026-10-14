import type { Messages } from "../shared/i18n";
import { BUILTIN_MCP_SERVERS } from "../shared/mcp";
import type { McpServerConfig } from "../shared/types";

// A server's description as shown. A built-in server whose description is
// still the default shows it in the UI language; the stored text, which the
// agent reads, stays as it is.
export function mcpServerDescription(server: McpServerConfig, t: Messages) {
  const builtin = BUILTIN_MCP_SERVERS.find((item) => item.id === server.id);
  const texts: Record<string, string> = t.display.builtinMcpServers;
  if (
    builtin &&
    server.description === builtin.description &&
    Object.hasOwn(texts, builtin.name)
  )
    return texts[builtin.name];
  return server.description;
}
