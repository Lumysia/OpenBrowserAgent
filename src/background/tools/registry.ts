import { hasToolGroup } from "../../shared/agents";
import { TOOL_NAME } from "../../shared/tool-names";
import { actTool } from "./act";
import { askTool } from "./ask";
import { devtoolsTool, runScriptTool } from "./devtools";
import { editPageTool } from "./edit-page";
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

// The tools of one run. Core tools are declared from the first request;
// on-demand tools once toolSearch loads them, and they stay loaded for the
// rest of the chat (`loaded` names the ones earlier turns loaded). Where
// the provider supports it (see piModel), a loaded tool is declared in a
// message after the cached prefix; elsewhere the tool list grows, which costs
// one cache miss per load.
export function createToolSet(run: RunContext, loaded: string[] = []) {
  const allowed = [...BUILTIN_TOOLS, ...mcpToolDefinitions(run.mcpServers)]
    .filter((tool) => !tool.group || hasToolGroup(run.agent, tool.group))
    .filter((tool) => tool.available?.(run) ?? true);
  const core = allowed.filter((tool) => !tool.onDemand);
  const onDemand = allowed.filter((tool) => tool.onDemand);
  const added: ToolDefinition[] = [];

  function load(names: string[], query: string) {
    const matches = onDemand.filter(
      (tool) => names.includes(tool.name) || matchesQuery(tool, query),
    );
    for (const tool of matches) if (!added.includes(tool)) added.push(tool);
    return matches;
  }
  load(loaded, "");

  const toolSearch: ToolDefinition = {
    name: TOOL_NAME.toolSearch,
    readOnly: true,
    summary: "Load more tools",
    description: `Load more tools by name and/or a search query, then call them in your next step. Available:\n${onDemand
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
    // Declared from the first request of every run.
    base: () => base,
    declared: () => [...base, ...added],
    find: (name: string) =>
      base.find((tool) => tool.name === name) ||
      added.find((tool) => tool.name === name),
    onDemand,
  };
}

// Query words (any script) found in a tool's name, summary or description.
// Scripts without spaces between words (Chinese, Japanese) also match on
// any two-character part of the query.
function matchesQuery(tool: ToolDefinition, query: string) {
  const text = `${tool.name} ${tool.summary} ${tool.description}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .flatMap((word) =>
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word) &&
      word.length > 2
        ? [
            word,
            ...Array.from(word.slice(1), (_, index) =>
              word.slice(index, index + 2),
            ),
          ]
        : [word],
    )
    .some(
      (term) =>
        (term.length > 2 || (term.length === 2 && /[^\x00-\x7f]/.test(term))) &&
        text.includes(term),
    );
}
