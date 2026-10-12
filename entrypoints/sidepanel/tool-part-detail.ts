import type { Messages } from "../../src/shared/i18n";
import { isMcpToolName, TOOL_NAME } from "../../src/shared/tool-names";
import { CHAT_PART_STATE, type ChatPart } from "../../src/shared/types";
import {
  compactJoin,
  idLabel,
  shortValue,
  stringValue,
} from "./tool-detail-format";
import { subAgentProgressDetail } from "./sub-agent-tool-display";
import { toolReferences } from "./tool-references";

const TITLE_MAX_LENGTH = 54;
const URL_MAX_LENGTH = 42;
const DESCRIPTION_MAX_LENGTH = 118;

type ToolRecord = Record<string, unknown>;

export function toolJsonDetail(name: string, part: ChatPart) {
  return JSON.stringify(
    compactJsonValue({
      toolName: name,
      state: part.state,
      input: part.input || {},
      output: part.output ?? null,
    }),
    null,
    2,
  );
}

export function toolLabel(name: string, t: Messages, done = true) {
  const text = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  if (text) return done ? text.done : text.running;
  return isMcpToolName(name) ? name.split("__").slice(1).join(" · ") : name;
}

// One line per tool part: what it worked on and what came of it.
const DETAILS: Record<
  string,
  (input: ToolRecord, output: ToolRecord, t: Messages) => string
> = {
  [TOOL_NAME.tabs]: (input, output) =>
    input.action === "list"
      ? `${output.count ?? ""} tabs`
      : compactJoin([stringValue(input.action), pageLabel(output, input)]),
  [TOOL_NAME.snapshot]: (input, output) =>
    compactJoin([
      pageLabel(output, input),
      output.lines ? `${output.lines} lines` : "",
    ]),
  [TOOL_NAME.find]: (input, output) =>
    compactJoin([
      `"${stringValue(input.query)}"`,
      output.matches !== undefined ? `${output.matches} matches` : "",
    ]),
  [TOOL_NAME.read]: (input, output) =>
    compactJoin([
      stringValue(output.title) ||
        stringValue(output.name) ||
        stringValue(input.source) ||
        "tab",
    ]),
  [TOOL_NAME.extract]: (input) => stringValue(input.question),
  [TOOL_NAME.act]: (input, output) => {
    const steps = Array.isArray(input.steps)
      ? (input.steps as ToolRecord[])
      : [];
    return compactJoin([
      steps.map((step) => stringValue(step.action)).join(", "),
      idLabel("Tab", output.tabId ?? input.tabId),
    ]);
  },
  [TOOL_NAME.editPage]: (input, output) => {
    const edits = Array.isArray(input.edits) ? input.edits.length : 0;
    return compactJoin([
      output.applied !== undefined ? `${output.applied}/${edits}` : `${edits}`,
      idLabel("Tab", output.tabId ?? input.tabId),
    ]);
  },
  [TOOL_NAME.webSearch]: (input, output) =>
    compactJoin([
      `"${stringValue(input.query)}"`,
      output.count !== undefined ? `${output.count} results` : "",
    ]),
  [TOOL_NAME.screenshot]: (input, output) => pageLabel(output, input),
  [TOOL_NAME.toolSearch]: (input, output) =>
    Array.isArray(output.loaded)
      ? output.loaded.join(", ")
      : Array.isArray(input.names)
        ? input.names.join(", ")
        : stringValue(input.query),
  [TOOL_NAME.export]: (input, output) =>
    stringValue(output.filename) || stringValue(input.action),
  [TOOL_NAME.skills]: (input) =>
    compactJoin([
      stringValue(input.action),
      stringValue(input.name),
      stringValue(input.path),
    ]),
  [TOOL_NAME.workspace]: (input) =>
    compactJoin([
      stringValue(input.action),
      stringValue(input.path) || stringValue(input.query),
    ]),
  [TOOL_NAME.chatHistory]: (input) =>
    compactJoin([
      stringValue(input.action),
      stringValue(input.query) || stringValue(input.chatId),
    ]),
  [TOOL_NAME.subAgent]: (input, output, t) =>
    compactJoin([
      subAgentState(output, t),
      stringValue(output.title) ||
        stringValue(input.title) ||
        stringValue(input.task),
    ]),
  [TOOL_NAME.mcpServers]: (input) =>
    compactJoin([
      stringValue(input.action),
      stringValue(input.name) || stringValue(input.serverId),
    ]),
  [TOOL_NAME.localCommand]: (input, output) =>
    compactJoin([stringValue(output.state), stringValue(input.command)]),
  [TOOL_NAME.localBridges]: (input) =>
    compactJoin([
      stringValue(input.action),
      stringValue(input.bridgeId) || stringValue(input.name),
    ]),
  [TOOL_NAME.generateImage]: (input, output) =>
    stringValue(output.revisedPrompt) || stringValue(input.prompt),
  [TOOL_NAME.runScript]: (input, output) =>
    idLabel("Tab", output.tabId ?? input.tabId),
  [TOOL_NAME.devtools]: (input) =>
    compactJoin([stringValue(input.action), idLabel("Tab", input.tabId)]),
};

export function toolDisplay(
  name: string,
  part: ChatPart,
  t: Messages,
  runEnded = false,
) {
  const input = (part.input || {}) as ToolRecord;
  const output = (part.output || {}) as ToolRecord;
  const done =
    part.state === CHAT_PART_STATE.outputAvailable ||
    part.state === CHAT_PART_STATE.outputError ||
    (runEnded && part.state === CHAT_PART_STATE.inputAvailable);
  const awaitingAnswer =
    name === TOOL_NAME.ask && !Array.isArray(output.answers);
  const title = toolLabel(name, t, done && !awaitingAnswer);
  const detail =
    typeof output.error === "string"
      ? output.error
      : isMcpToolName(name)
        ? mcpToolDetail(input, output)
        : DETAILS[name]?.(input, output, t) || "";
  return {
    title,
    description: shortValue(
      detail ||
        (part.state === CHAT_PART_STATE.outputError ? t.sidepanel.error : ""),
      DESCRIPTION_MAX_LENGTH,
    ),
    references: toolReferences(name, output),
    subAgentProgress:
      name === TOOL_NAME.subAgent ? subAgentProgressDetail(output, t) : "",
  };
}

function pageLabel(output: ToolRecord, input: ToolRecord) {
  return compactJoin([
    idLabel("Tab", output.tabId ?? input.tabId),
    shortValue(stringValue(output.title), TITLE_MAX_LENGTH) ||
      shortValue(
        stringValue(output.url).replace(/^https?:\/\//, ""),
        URL_MAX_LENGTH,
      ),
  ]);
}

function subAgentState(output: ToolRecord, t: Messages) {
  const state = stringValue(output.state);
  if (state === "completed") return t.sidepanel.subAgentCompleted;
  if (state === "running") return t.sidepanel.subAgentRunning;
  if (state === "failed") return t.sidepanel.error;
  return "";
}

function mcpToolDetail(input: ToolRecord, output: ToolRecord) {
  const params = Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) =>
      typeof value === "string" && /^https?:\/\//i.test(value)
        ? `${key}: URL`
        : `${key}: ${shortValue(Array.isArray(value) ? `${value.length} items` : value, 48)}`,
    )
    .join(" · ");
  const result = output.result as ToolRecord | undefined;
  const count = Array.isArray(result?.content) ? result.content.length : 0;
  return compactJoin([params, count ? `${count} results` : ""]);
}

function compactJsonValue(value: unknown): unknown {
  if (typeof value === "string")
    return value.length > 4000 ? `${value.slice(0, 4000)}...` : value;
  if (Array.isArray(value)) return value.map(compactJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as ToolRecord).map(([key, item]) => [
      key,
      compactJsonValue(item),
    ]),
  );
}
