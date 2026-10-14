import { formatDuration } from "../../src/shared/format";
import { formatCount, type Messages } from "../../src/shared/i18n";
import type { Plural } from "../../src/shared/plural";
import { isMcpToolName, TOOL_NAME } from "../../src/shared/tool-names";
import { CHAT_PART_STATE, type ChatPart } from "../../src/shared/types";
import {
  actionLabel,
  compactJoin,
  knownLabel,
  shortValue,
  stringValue,
  type ToolRecord,
  type ToolStepState,
  type ToolStepOutcome,
} from "./tool-detail-format";
import { downloadsDetail, downloadsOutcome } from "./download-tool-display";
import { subAgentProgressDetail } from "./sub-agent-tool-display";
import { toolReferences } from "./tool-references";
import { actStepsSummary } from "./tool-step-summary";

const TITLE_MAX_LENGTH = 54;
const URL_MAX_LENGTH = 42;
const DESCRIPTION_MAX_LENGTH = 118;

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
      : compactJoin([actionLabel(input.action, t), pageLabel(output)]),
  [TOOL_NAME.snapshot]: (input, output, t) =>
    compactJoin([
      pageLabel(output),
      countLabel(t.display.toolSteps.lines, output.lines),
    ]),
  [TOOL_NAME.find]: (input, output, t) =>
    compactJoin([`"${stringValue(input.query)}"`, findCounts(output, t)]),
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
  // Tool ids are code names; the step shows how many, the JSON details which.
  [TOOL_NAME.toolSearch]: (input, output, t) =>
    Array.isArray(output.loaded)
      ? formatCount(t.display.toolSteps.tools, output.loaded.length)
      : Array.isArray(input.names)
        ? formatCount(t.display.toolSteps.tools, input.names.length)
        : stringValue(input.query),
  [TOOL_NAME.downloads]: downloadsDetail,
  [TOOL_NAME.skills]: (input, output, t) =>
    compactJoin([
      actionLabel(input.action, t),
      stringValue(input.name),
      stringValue(input.path),
    ]),
  [TOOL_NAME.workspace]: (input, output, t) =>
    compactJoin([
      actionLabel(input.action, t),
      stringValue(input.path) || stringValue(input.query),
    ]),
  [TOOL_NAME.chatHistory]: (input, output, t) =>
    compactJoin([
      actionLabel(input.action, t),
      stringValue(input.query) || stringValue(input.chatId),
    ]),
  [TOOL_NAME.subAgent]: (input, output, t) =>
    compactJoin([
      subAgentState(output, t),
      stringValue(output.title) ||
        stringValue(input.title) ||
        stringValue(input.task),
    ]),
  [TOOL_NAME.mcpServers]: (input, output, t) =>
    compactJoin([
      actionLabel(input.action, t),
      stringValue(input.name) || stringValue(input.serverId),
    ]),
  [TOOL_NAME.localCommand]: (input, output, t) =>
    compactJoin([
      knownLabel(t.display.toolSteps.commandStates, output.state),
      stringValue(input.command),
    ]),
  [TOOL_NAME.localBridges]: (input, output, t) =>
    compactJoin([
      actionLabel(input.action, t),
      stringValue(input.bridgeId) || stringValue(input.name),
    ]),
  [TOOL_NAME.generateImage]: (input, output) =>
    stringValue(output.revisedPrompt) || stringValue(input.prompt),
  [TOOL_NAME.runScript]: (input, output) => pageLabel(output),
  // "120 ms · 2 files saved"
  [TOOL_NAME.runCode]: (input, output, t) =>
    compactJoin([
      typeof output.durationMs === "number"
        ? formatDuration(output.durationMs)
        : "",
      Array.isArray(output.files) && output.files.length
        ? formatCount(t.display.toolSteps.filesSaved, output.files.length)
        : "",
    ]),
  [TOOL_NAME.devtools]: (input, output, t) => actionLabel(input.action, t),
};

// Tools whose title says what came of the step; the others show their
// name (toolLabel) and the line from DETAILS.
const OUTCOMES: Record<
  string,
  (
    input: ToolRecord,
    output: ToolRecord,
    t: Messages,
    state: ToolStepState,
  ) => ToolStepOutcome | undefined
> = {
  [TOOL_NAME.downloads]: downloadsOutcome,
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
  const errored =
    typeof output.error === "string" ||
    part.state === CHAT_PART_STATE.outputError;
  const state: ToolStepState =
    !done || awaitingAnswer ? "running" : errored ? "failed" : "done";
  const outcome = OUTCOMES[name]?.(input, output, t, state);
  const title = outcome?.title || toolLabel(name, t, state !== "running");
  // A failed step's error is English text for the model; the line says it
  // failed and the JSON details keep the text.
  const detail =
    outcome?.description ??
    (errored
      ? t.display.toolSteps.failed
      : isMcpToolName(name)
        ? mcpToolDetail(input, output, t)
        : DETAILS[name]?.(input, output, t) || "");
  return {
    title,
    failed: errored || !!outcome?.failed,
    description: shortValue(detail, DESCRIPTION_MAX_LENGTH),
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

// Chats from before occurrences were counted stored the matching lines as
// `matches`.
function findCounts(output: ToolRecord, t: Messages) {
  const steps = t.display.toolSteps;
  const lines = output.matchingLines ?? output.matches;
  if (typeof lines !== "number") return "";
  return typeof output.occurrences === "number"
    ? formatCount(steps.matchingLinesWithOccurrences, lines, {
        occurrences: formatCount(steps.occurrences, output.occurrences),
      })
    : formatCount(steps.matchingLines, lines);
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
