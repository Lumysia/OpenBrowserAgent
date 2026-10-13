import type { McpServerConfig } from "./mcp";
import { getBrowserApi } from "./browser-api";
import { storage } from "./storage";

// Some MCP servers reject any request with an Origin header, and a browser
// adds one to every request an extension page or worker makes. For servers
// with `omitOrigin`, a declarativeNetRequest rule removes it from this
// extension's own requests to the server's URL; nothing else is touched.
// The rules are dynamic (they outlive the service worker) and are rebuilt
// from the stored servers at startup and on every change.

// Dynamic rule ids this module owns; other ids are left alone.
export const MCP_ORIGIN_RULE_ID_BASE = 41_000;
export const MCP_ORIGIN_RULE_LIMIT = 200;

type DnrApi = Pick<typeof chrome.declarativeNetRequest, "updateDynamicRules">;
type Rule = chrome.declarativeNetRequest.Rule;

export class McpOriginRulesUnsupportedError extends Error {
  constructor() {
    super(
      "This browser cannot send requests without the Origin header, and the server rejects browser requests.",
    );
    this.name = "McpOriginRulesUnsupportedError";
  }
}

// The URL a request to the server is made to, as the browser matches it.
export function mcpRequestUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "";
  }
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// One rule per distinct server URL with the option on. `initiatorHost` is the
// host of this extension's origin (its id in Chromium, a per-install UUID in
// Firefox).
export function buildMcpOriginRules(
  servers: readonly McpServerConfig[],
  initiatorHost: string,
): Rule[] {
  const urls = [
    ...new Set(
      servers
        .filter((server) => server.omitOrigin)
        .map((server) => mcpRequestUrl(server.url))
        .filter(Boolean),
    ),
  ].slice(0, MCP_ORIGIN_RULE_LIMIT);
  return urls.map((url, index) => ({
    id: MCP_ORIGIN_RULE_ID_BASE + index,
    priority: 1,
    action: {
      type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        {
          header: "origin",
          operation: "remove" as chrome.declarativeNetRequest.HeaderOperation,
        },
      ],
    },
    condition: {
      regexFilter: `^${escapeRegex(url)}$`,
      initiatorDomains: [initiatorHost],
      resourceTypes: [
        "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
      ],
    },
  }));
}

function dnrApi(): DnrApi | undefined {
  const api = (getBrowserApi() as typeof chrome).declarativeNetRequest;
  return typeof api?.updateDynamicRules === "function" ? api : undefined;
}

export function mcpOriginRulesSupported() {
  return !!dnrApi();
}

function extensionHost() {
  return new URL(getBrowserApi().runtime.getURL("/")).host;
}

const OWN_RULE_IDS = Array.from(
  { length: MCP_ORIGIN_RULE_LIMIT },
  (_, index) => MCP_ORIGIN_RULE_ID_BASE + index,
);

// Replaces this module's rules with those for the stored servers and `extra`
// (a server about to be contacted that may not be stored yet). One update
// removes the whole id range and adds the new rules, so calls from several
// extension contexts cannot leave a mix.
export async function syncMcpOriginRules(extra?: McpServerConfig) {
  const api = dnrApi();
  if (!api) return false;
  const servers = await storage.mcpServers.get();
  await api.updateDynamicRules({
    removeRuleIds: OWN_RULE_IDS,
    addRules: buildMcpOriginRules(
      extra ? [...servers, extra] : servers,
      extensionHost(),
    ),
  });
  return true;
}

// Before a request to `server`: its rule must be in place, or the request
// would go out with an Origin the server rejects.
export async function prepareMcpRequest(server: McpServerConfig) {
  if (!server.omitOrigin) return;
  if (!(await syncMcpOriginRules(server)))
    throw new McpOriginRulesUnsupportedError();
}

// Background: keep the rules in step with the stored servers.
export function setupMcpOriginRules() {
  if (!mcpOriginRulesSupported()) return;
  syncMcpOriginRules().catch((error) =>
    console.warn("Failed to update MCP origin rules", error),
  );
  storage.mcpServers.watch(() => {
    syncMcpOriginRules().catch((error) =>
      console.warn("Failed to update MCP origin rules", error),
    );
  });
}
