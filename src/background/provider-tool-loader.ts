import { BROWSER_TOOL_NAME } from "../shared/browser-tools";
import type { AgentCapabilities } from "../shared/types";
import {
  browserTools,
  deferredBrowserTools,
  loaderBrowserTools,
} from "./tool-schema";

type DeferredToolContext = {
  hasSkills: boolean;
  hasWorkspace: boolean;
  cdpToolsAvailable: boolean;
};

export function loadTools(
  input: Record<string, unknown>,
  capabilities: AgentCapabilities,
  context: DeferredToolContext,
) {
  const operation = String(input.operation || "load")
    .trim()
    .toLowerCase();
  const requestedNames = Array.isArray(input.names)
    ? input.names
        .map(String)
        .map((name) => name.trim())
        .filter(Boolean)
    : [];
  const query = String(input.query || "")
    .trim()
    .toLowerCase();
  const category = String(input.category || "")
    .trim()
    .toLowerCase();
  const catalog = deferredBrowserTools.map((item) =>
    toolCatalogItem(item, capabilities, context),
  );
  const filteredCatalog = catalog.filter(
    (item) => !category || item.category === category,
  );

  if (operation === "list" || operation === "catalog") {
    const items = filteredCatalog
      .map((item) => ({
        name: item.name,
        category: item.category,
        description: item.description,
        available: item.available,
        unavailableReason: item.unavailableReason,
      }))
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      );
    return {
      success: true,
      operation: "list",
      categories: [...new Set(catalog.map((item) => item.category))].sort(),
      toolCount: items.length,
      availableToolCount: items.filter((item) => item.available).length,
      summary: toolSummary(catalog, 0),
      tools: items,
      guidance:
        "Call loadTools with operation=load and exact names, category, or query to load deferred tool schemas.",
    };
  }

  const scored = filteredCatalog
    .map((item) => ({
      item,
      score: requestedNames.length
        ? requestedNames.includes(item.name)
          ? 1
          : 0
        : queryScore(item, query),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name),
    );
  const matches = scored
    .map(({ item }) => item)
    .filter((item) => item.available)
    .slice(0, 8);
  const unavailableMatches = scored
    .map(({ item }) => item)
    .filter((item) => !item.available);
  const knownNames = new Set(catalog.map((item) => item.name));
  const unknownNames = requestedNames.filter((name) => !knownNames.has(name));

  return {
    success: matches.length > 0,
    loadedToolNames: matches.map((item) => item.name),
    availableDeferredToolCount: catalog.filter((item) => item.available).length,
    summary: toolSummary(catalog, matches.length),
    unavailableMatches: unavailableMatches.map((item) => ({
      name: item.name,
      category: item.category,
      unavailableReason: item.unavailableReason,
    })),
    unknownNames,
    categories: [...new Set(catalog.map((item) => item.category))].sort(),
    message: matches.length
      ? "Deferred tools loaded. Call the loaded tool directly in the next step."
      : "No deferred tools were loaded. Use operation=list to inspect available tools, categories, and unavailable reasons.",
    tools: matches.map((item) => ({
      ...item,
      schema: deferredBrowserTools.find(
        (tool) => tool.function.name === item.name,
      )?.function,
    })),
  };
}

function toolSummary(
  catalog: Array<ReturnType<typeof toolCatalogItem>>,
  loadedDeferredTools: number,
) {
  const availableDeferredTools = catalog.filter(
    (item) => item.available,
  ).length;
  return {
    directTools: browserTools.length,
    loaderTools: loaderBrowserTools.length,
    deferredTools: {
      total: catalog.length,
      available: availableDeferredTools,
      unavailable: catalog.length - availableDeferredTools,
    },
    loadedDeferredTools,
    loadedDeferredToolsInThisCall: loadedDeferredTools,
    allCallableAfterLoad: browserTools.length + loadedDeferredTools,
  };
}

function queryScore(item: ReturnType<typeof toolCatalogItem>, query: string) {
  if (!query) return 1;
  const searchable = `${item.name} ${item.description} ${item.category}`
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  if (searchable.includes(query)) return 100;
  const terms = query
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim().toLowerCase())
    .filter(
      (term) => term.length > 2 && !DEFERRED_TOOL_QUERY_STOP_WORDS.has(term),
    );
  if (!terms.length) return 1;
  return terms.reduce(
    (score, term) => score + (searchable.includes(term) ? 1 : 0),
    0,
  );
}

function toolCatalogItem(
  item: (typeof deferredBrowserTools)[number],
  capabilities: AgentCapabilities,
  context: DeferredToolContext,
) {
  const name = item.function.name;
  const available = deferredToolAvailable(name, capabilities, context);
  return {
    name,
    description: item.function.description,
    category: toolCategory(name),
    available,
    unavailableReason: available
      ? undefined
      : deferredToolUnavailableReason(name, capabilities, context),
  };
}

function deferredToolAvailable(
  name: string,
  capabilities: AgentCapabilities,
  context: DeferredToolContext,
) {
  if (name.startsWith("cdp"))
    return (
      capabilities.cdpTools &&
      context.cdpToolsAvailable &&
      (name !== BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript ||
        capabilities.javascriptExecution)
    );
  if (
    name === BROWSER_TOOL_NAME.startSubAgent ||
    name === BROWSER_TOOL_NAME.getSubAgentStatus
  )
    return capabilities.subAgents;
  if (
    name === BROWSER_TOOL_NAME.manageLocalExecutionBridges ||
    name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
    name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
    name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge
  )
    return capabilities.localExecutionBridges;
  if (name === BROWSER_TOOL_NAME.manageSkills)
    return (
      capabilities.skillTools &&
      (context.hasSkills || capabilities.skillCreation)
    );
  if (name === BROWSER_TOOL_NAME.workspaceFiles)
    return (
      context.hasWorkspace &&
      (capabilities.workspaceRead || capabilities.workspaceWrite)
    );
  if (name === BROWSER_TOOL_NAME.manageMemory)
    return (
      context.hasWorkspace &&
      (capabilities.memoryRead || capabilities.memoryWrite)
    );
  if (name === BROWSER_TOOL_NAME.manageChatHistory)
    return capabilities.chatHistoryRead || capabilities.chatHistoryWrite;
  if (name === BROWSER_TOOL_NAME.manageMcpServers)
    return capabilities.mcpManagement;
  return true;
}

function deferredToolUnavailableReason(
  name: string,
  capabilities: AgentCapabilities,
  context: DeferredToolContext,
) {
  if (name.startsWith("cdp")) {
    if (!capabilities.cdpTools)
      return "CDP tools are disabled for the active agent.";
    if (!context.cdpToolsAvailable)
      return "CDP is not available in this browser/runtime.";
    if (
      name === BROWSER_TOOL_NAME.cdpExecuteArbitraryJavaScript &&
      !capabilities.javascriptExecution
    )
      return "Page JavaScript execution is disabled for the active agent.";
  }
  if (
    (name === BROWSER_TOOL_NAME.startSubAgent ||
      name === BROWSER_TOOL_NAME.getSubAgentStatus) &&
    !capabilities.subAgents
  )
    return "Sub-agent tools are disabled for the active agent.";
  if (
    (name === BROWSER_TOOL_NAME.manageLocalExecutionBridges ||
      name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
      name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
      name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge) &&
    !capabilities.localExecutionBridges
  )
    return "Local execution bridge tools are disabled for the active agent.";
  if (name === BROWSER_TOOL_NAME.manageSkills) {
    if (!capabilities.skillTools)
      return "Skill tools are disabled for the active agent.";
    if (!context.hasSkills && !capabilities.skillCreation)
      return "No skills are available, and skill creation is disabled.";
  }
  if (name === BROWSER_TOOL_NAME.workspaceFiles) {
    if (!context.hasWorkspace) return "No workspace is attached to this chat.";
    if (!capabilities.workspaceRead && !capabilities.workspaceWrite)
      return "Workspace file tools are disabled for the active agent.";
  }
  if (name === BROWSER_TOOL_NAME.manageMemory) {
    if (!context.hasWorkspace) return "No workspace is attached to this chat.";
    if (!capabilities.memoryRead && !capabilities.memoryWrite)
      return "Memory tools are disabled for the active agent.";
  }
  if (
    name === BROWSER_TOOL_NAME.manageChatHistory &&
    !capabilities.chatHistoryRead &&
    !capabilities.chatHistoryWrite
  )
    return "Chat history tools are disabled for the active agent.";
  if (
    name === BROWSER_TOOL_NAME.manageMcpServers &&
    !capabilities.mcpManagement
  )
    return "MCP server management is disabled for the active agent.";
  return "Tool category is disabled or missing required context for the active agent.";
}

function toolCategory(name: string) {
  if (name in TOOL_CATEGORY_BY_NAME)
    return TOOL_CATEGORY_BY_NAME[name as keyof typeof TOOL_CATEGORY_BY_NAME];
  if (name.startsWith("cdp")) return "cdp";
  return "common";
}

const TOOL_CATEGORY_BY_NAME = {
  [BROWSER_TOOL_NAME.startSubAgent]: "agents",
  [BROWSER_TOOL_NAME.getSubAgentStatus]: "agents",
  [BROWSER_TOOL_NAME.manageLocalExecutionBridges]: "bridges",
  [BROWSER_TOOL_NAME.startLocalExecutionBridge]: "bridges",
  [BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus]: "bridges",
  [BROWSER_TOOL_NAME.cancelLocalExecutionBridge]: "bridges",
  [BROWSER_TOOL_NAME.readUploadedAttachment]: "files",
  [BROWSER_TOOL_NAME.readFileFromUrl]: "files",
  [BROWSER_TOOL_NAME.generateImage]: "image",
  [BROWSER_TOOL_NAME.manageSkills]: "skills",
  [BROWSER_TOOL_NAME.workspaceFiles]: "workspace",
  [BROWSER_TOOL_NAME.manageMemory]: "memory",
  [BROWSER_TOOL_NAME.manageChatHistory]: "history",
  [BROWSER_TOOL_NAME.manageMcpServers]: "mcp",
} as const;

const DEFERRED_TOOL_QUERY_STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with",
  "into",
  "from",
  "current",
  "tool",
  "tools",
]);
