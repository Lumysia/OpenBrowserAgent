import { hasToolGroup } from "../../shared/agents";
import { TOOL_NAME } from "../../shared/tool-names";
import { actTool, editPageTool } from "./act";
import { askTool } from "./ask";
import { devtoolsTool, runScriptTool } from "./devtools";
import { exportTool } from "./export";
import { chatHistoryTool } from "./history";
import { generateImageTool } from "./images";
import { localBridgesTool, localCommandTool } from "./local";
import { mcpServersTool, mcpToolDefinitions } from "./mcp";
import { extractTool, findTool, snapshotTool } from "./page";
import { readTool } from "./read";
import { skillsTool } from "./skills";
import { subAgentTool } from "./sub-agent";
import { screenshotTool, tabsTool, webSearchTool } from "./tabs";
import { schema, type RunContext, type ToolDefinition } from "./types";
import { workspaceTool } from "./workspace";

export const BUILTIN_TOOLS: ToolDefinition[] = [
  tabsTool,
  snapshotTool,
  findTool,
  readTool,
  extractTool,
  actTool,
  editPageTool,
  webSearchTool,
  screenshotTool,
  askTool,
  exportTool,
  skillsTool,
  workspaceTool,
  chatHistoryTool,
  subAgentTool,
  mcpServersTool,
  localCommandTool,
  localBridgesTool,
  generateImageTool,
  runScriptTool,
  devtoolsTool,
];

// The tools of one run: core tools are declared from the first request;
// on-demand tools are declared once toolSearch loads them. Declarations are
// only ever appended, so the cached request prefix stays valid.
export function createToolSet(run: RunContext) {
  const allowed = [...BUILTIN_TOOLS, ...mcpToolDefinitions(run.mcpServers)]
    .filter((tool) => !tool.group || hasToolGroup(run.agent, tool.group))
    .filter((tool) => tool.available?.(run) ?? true);
  const core = allowed.filter((tool) => !tool.onDemand);
  const onDemand = allowed.filter((tool) => tool.onDemand);
  const loaded: ToolDefinition[] = [];

  function load(names: string[], query: string) {
    const terms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 2);
    const matches = onDemand.filter(
      (tool) =>
        names.includes(tool.name) ||
        (!names.length &&
          terms.some((term) =>
            `${tool.name} ${tool.summary}`.toLowerCase().includes(term),
          )),
    );
    for (const tool of matches) if (!loaded.includes(tool)) loaded.push(tool);
    return matches;
  }

  const toolSearch: ToolDefinition = {
    name: TOOL_NAME.toolSearch,
    readOnly: true,
    summary: "Load more tools",
    description: `Load more tools by name (or by a search query), then call them in your next step. Available:\n${onDemand
      .map((tool) => `- ${tool.name}: ${tool.summary}`)
      .join("\n")}`,
    parameters: schema({
      names: { type: "array", items: { type: "string" } },
      query: { type: "string" },
    }),
    async execute(input) {
      const names = Array.isArray(input.names) ? input.names.map(String) : [];
      const matches = load(names, String(input.query || ""));
      if (!matches.length)
        return {
          text: `Nothing matched. Available: ${onDemand.map((tool) => tool.name).join(", ")}.`,
          details: { loaded: [] },
          isError: true,
        };
      const loadedNames = matches.map((tool) => tool.name);
      return {
        text: `Loaded ${loadedNames.join(", ")}. Call them directly now.`,
        details: { loaded: loadedNames },
      };
    },
  };

  const base = onDemand.length ? [...core, toolSearch] : core;
  return {
    declared: () => [...base, ...loaded],
    find: (name: string) =>
      base.find((tool) => tool.name === name) ||
      loaded.find((tool) => tool.name === name),
    onDemand,
  };
}

export type ToolSet = ReturnType<typeof createToolSet>;
