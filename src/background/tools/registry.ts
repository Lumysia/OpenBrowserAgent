import { hasToolGroup } from "../../shared/agents";
import { TOOL_NAME } from "../../shared/tool-names";
import { actTool } from "./act";
import { askTool } from "./ask";
import { devtoolsTool, runScriptTool } from "./devtools";
import { downloadsTool } from "./downloads";
import { editPageTool } from "./edit-page";
import { chatHistoryTool } from "./history";
import { generateImageTool } from "./images";
import { localBridgesTool, localCommandTool } from "./local";
import { mcpServersTool, mcpToolDefinitions } from "./mcp";
import { extractTool, findTool, snapshotTool } from "./page";
import { readTool } from "./read";
import { runCodeTool } from "./run-code";
import { skillCheckTool } from "./skill-check";
import { skillsTool } from "./skills";
import { subAgentTool } from "./sub-agent";
import { screenshotTool } from "./screenshot";
import { tabsTool, webSearchTool } from "./tabs";
import { taskResultTool, tasksTool } from "./tasks";
import {
  fail,
  schema,
  TOOL_EFFECT,
  type ToolSetup,
  type ToolDefinition,
} from "./types";
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
  downloadsTool,
  skillsTool,
  workspaceTool,
  runCodeTool,
  chatHistoryTool,
  subAgentTool,
  mcpServersTool,
  localCommandTool,
  localBridgesTool,
  generateImageTool,
  runScriptTool,
  devtoolsTool,
  tasksTool,
  taskResultTool,
  skillCheckTool,
];

// The tools of one run. Core tools are declared from the first request;
// on-demand tools once toolSearch loads them, and they stay loaded for the
// rest of the chat (`loaded` names the ones earlier turns loaded). Where
// the provider supports it (see piModel), a loaded tool is declared in a
// message after the cached prefix; elsewhere the tool list grows, which costs
// one cache miss per load.
export function createToolSet(setup: ToolSetup, loaded: string[] = []) {
  const allowed = [...BUILTIN_TOOLS, ...mcpToolDefinitions(setup.mcpServers)]
    .filter((tool) => !tool.group || hasToolGroup(setup.agent, tool.group))
    .filter((tool) => tool.available?.(setup) ?? true)
    .flatMap((tool) => {
      if (!setup.unattended?.readOnly) return [tool];
      const reading = readingTool(tool);
      return reading ? [reading] : [];
    });
  const core = allowed.filter((tool) => !tool.onDemand);
  const onDemand = allowed.filter((tool) => tool.onDemand);
  const loadedTools: ToolDefinition[] = [];

  function load(names: string[], query: string) {
    const matches = onDemand.filter(
      (tool) => names.includes(tool.name) || matchesQuery(tool, query),
    );
    const added = matches.filter((tool) => !loadedTools.includes(tool));
    loadedTools.push(...added);
    return { matches, added };
  }
  load(loaded, "");

  // The index lists only tools not loaded yet: loaded ones are declared and
  // callable already. It is fixed for the run, so the declared prefix stays
  // cached; a tool loaded later in this run stays listed until the next turn.
  const loadable = onDemand.filter((tool) => !loadedTools.includes(tool));
  const toolSearch: ToolDefinition = {
    name: TOOL_NAME.toolSearch,
    effects: "read",
    readOnly: true,
    summary: "Load more tools",
    description: loadable.length
      ? `Load more tools by name and/or a search query, then call them in your next step. Loadable:\n${loadable
          .map((tool) => `- ${tool.name}: ${tool.summary}`)
          .join("\n")}`
      : "Load more tools by name and/or a search query. Every on-demand tool is loaded already; call them directly.",
    parameters: schema({
      names: { type: "array", items: { type: "string" } },
      query: { type: "string" },
    }),
    async execute(input) {
      const names = Array.isArray(input.names) ? input.names.map(String) : [];
      const { matches, added } = load(names, String(input.query || ""));
      const coreNames = names.filter((name) =>
        core.some((tool) => tool.name === name),
      );
      const newlyLoaded = added.map((tool) => tool.name);
      const alreadyAvailable = [
        ...coreNames,
        ...matches
          .filter((tool) => !added.includes(tool))
          .map((tool) => tool.name),
      ];
      const notFound = names.filter(
        (name) =>
          !coreNames.includes(name) &&
          !matches.some((tool) => tool.name === name),
      );
      const loadedNames = matches.map((tool) => tool.name);
      const details = {
        loaded: loadedNames,
        newlyLoaded,
        alreadyAvailable,
        notFound,
      };
      if (!loadedNames.length && !coreNames.length)
        return {
          text: `Nothing matched. Loadable: ${
            onDemand
              .filter((tool) => !loadedTools.includes(tool))
              .map((tool) => tool.name)
              .join(", ") || "none, every tool is loaded already"
          }.`,
          details,
          isError: true,
        };
      return {
        text: [
          newlyLoaded.length && `Newly loaded: ${newlyLoaded.join(", ")}.`,
          alreadyAvailable.length &&
            `Already available: ${alreadyAvailable.join(", ")}.`,
          notFound.length && `Not found: ${notFound.join(", ")}.`,
          "Call tools directly by these exact names.",
        ]
          .filter(Boolean)
          .join(" "),
        details,
      };
    },
  };

  const base = onDemand.length ? [...core, toolSearch] : core;
  return {
    // Declared from the first request of every run.
    base: () => base,
    declared: () => [...base, ...loadedTools],
    find: (name: string) =>
      base.find((tool) => tool.name === name) ||
      loadedTools.find((tool) => tool.name === name),
    onDemand,
  };
}

// The tool as a read-only run gets it: as it is when it only reads, none
// when it acts, and for a tool with per-action effects one that declares
// and accepts only its reading actions.
export function readingTool(tool: ToolDefinition): ToolDefinition | undefined {
  const { effects } = tool;
  if (typeof effects === "string")
    return effects === TOOL_EFFECT.read ? tool : undefined;
  if ("byRun" in effects)
    return {
      ...tool,
      description: `${tool.description}\n${effects.byRun.readOnlyNote}`,
    };
  const reading = Object.keys(effects.byAction).filter(
    (action) => effects.byAction[action] === TOOL_EFFECT.read,
  );
  if (!reading.length) return undefined;
  const properties = (tool.parameters.properties || {}) as Record<
    string,
    Record<string, unknown>
  >;
  return {
    ...tool,
    description: `${tool.description}\nIn this run only these actions are available: ${reading.join(", ")}.`,
    parameters: {
      ...tool.parameters,
      properties: {
        ...properties,
        action: { ...properties.action, enum: reading },
      },
    },
    execute(input, context) {
      const action = String(input.action ?? "");
      if (!reading.includes(action))
        return Promise.resolve(
          fail(
            `"${action}" is not available in this run: it runs on its own and may only read. Use ${reading.join(", ")}.`,
          ),
        );
      return tool.execute(input, context);
    },
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
