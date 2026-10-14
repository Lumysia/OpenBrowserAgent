import { formatCount, type Messages } from "../../src/shared/i18n";
import type { Plural } from "../../src/shared/plural";
import { isMcpToolName, TOOL_NAME } from "../../src/shared/tool-names";
import { CHAT_PART_STATE, type ChatPart } from "../../src/shared/types";
import { compactJoin, shortValue, stringValue } from "./tool-detail-format";
import { subAgentProgressDetail } from "./sub-agent-tool-display";
import { toolReferences } from "./tool-references";
import { actStepsSummary } from "./tool-step-summary";

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

// One line per tool part: what it worked on and what came of it. Tab ids
// stay in the JSON details only.
const DETAILS: Record<
  string,
  (input: ToolRecord, output: ToolRecord, t: Messages) => string
> = {
  [TOOL_NAME.tabs]: (input, output, t) =>
    input.action === "list"
      ? countLabel(t.display.toolSteps.tabs, output.count)
      : compactJoin([tabActionLabel(input.action, t), pageLabel(output)]),
  [TOOL_NAME.snapshot]: (input, output, t) =>
    compactJoin([
      pageLabel(output),
      countLabel(t.display.toolSteps.lines, output.lines),
    ]),
  [TOOL_NAME.find]: (input, output, t) =>
    compactJoin([
      `"${stringValue(input.query)}"`,
      countLabel(t.display.toolSteps.matches, output.matches),
    ]),
  [TOOL_NAME.read]: (input, output, t) =>
    stringValue(output.title) ||
    stringValue(output.name) ||
    stringValue(input.source) ||
    t.display.toolSteps.page,
  [TOOL_NAME.extract]: (input) => stringValue(input.question),
  [TOOL_NAME.act]: (input, output, t) => {
    const steps = Array.isArray(input.steps) ? input.steps : [];
    const done =
      typeof output.done === "number" ? steps.slice(0, output.done) : steps;
    return actStepsSummary(done, t);
  },
  [TOOL_NAME.editPage]: (input, output, t) => {
    const edits = Array.isArray(input.edits) ? input.edits.length : 0;
    return typeof output.applied === "number"
      ? formatCount(t.display.toolSteps.editsApplied, edits, {
          applied: output.applied,
        })
      : "";
  },
  [TOOL_NAME.webSearch]: (input, output, t) =>
    compactJoin([
      `"${stringValue(input.query)}"`,
      countLabel(t.display.toolSteps.results, output.count),
    ]),
  [TOOL_NAME.screenshot]: (input, output) => pageLabel(output),
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
  [TOOL_NAME.runScript]: (input, output) => pageLabel(output),
  [TOOL_NAME.devtools]: (input) => stringValue(input.action),
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
        ? mcpToolDetail(input, output, t)
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

function pageLabel(output: ToolRecord) {
  return (
    shortValue(stringValue(output.title), TITLE_MAX_LENGTH) ||
    shortValue(
      stringValue(output.url).replace(/^https?:\/\//, ""),
      URL_MAX_LENGTH,
    )
  );
}

function countLabel(message: Plural, value: unknown) {
  return typeof value === "number" ? formatCount(message, value) : "";
}

function tabActionLabel(action: unknown, t: Messages) {
  const labels: Record<string, string> = t.display.toolSteps.tabActions;
  const key = stringValue(action);
  return Object.hasOwn(labels, key) ? labels[key] : key;
}

function subAgentState(output: ToolRecord, t: Messages) {
  const state = stringValue(output.state);
  if (state === "completed") return t.sidepanel.subAgentCompleted;
  if (state === "running") return t.sidepanel.subAgentRunning;
  if (state === "failed") return t.sidepanel.error;
  return "";
}

function mcpToolDetail(input: ToolRecord, output: ToolRecord, t: Messages) {
  const params = Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) =>
      typeof value === "string" && /^https?:\/\//i.test(value)
        ? `${key}: URL`
        : `${key}: ${Array.isArray(value) ? formatCount(t.display.toolSteps.items, value.length) : shortValue(value, 48)}`,
    )
    .join(" · ");
  const result = output.result as ToolRecord | undefined;
  const count = Array.isArray(result?.content) ? result.content.length : 0;
  return compactJoin([
    params,
    count ? formatCount(t.display.toolSteps.results, count) : "",
  ]);
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
