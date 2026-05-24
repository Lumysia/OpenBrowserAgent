import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import type { Messages } from "../../src/shared/i18n";
import type { ToolErrorCode } from "../../src/shared/tool-errors";
import { CHAT_PART_STATE, type ChatPart } from "../../src/shared/types";
import { cdpToolDetail } from "./cdp-tool-detail";
import { formatToolMessage } from "./format";
import {
  subAgentDetail,
  subAgentProgressDetail,
  subAgentTitle,
} from "./sub-agent-tool-display";
import { isMemoryToolName } from "./tool-icons";
import { toolReferences } from "./tool-references";

const TOOL_DETAIL_VALUE_MAX_LENGTH = 64;
const TOOL_DETAIL_TITLE_MAX_LENGTH = 54;
const TOOL_DETAIL_URL_MAX_LENGTH = 42;
const TOOL_DETAIL_DESCRIPTION_MAX_LENGTH = 118;

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

export function toolDisplay(
  name: string,
  part: ChatPart,
  t: Messages,
  runEnded = false,
) {
  const input = (part.input || {}) as Record<string, unknown>;
  const outputValue = part.output;
  const output = (outputValue || {}) as Record<string, unknown>;
  const state = part.state;
  const toolText = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  const toolFound = (toolText as { found?: string } | undefined)?.found;
  const title = (() => {
    const base =
      name === BROWSER_TOOL_NAME.question && questionToolAwaitingAnswer(output)
        ? toolText?.running
        : state === CHAT_PART_STATE.outputAvailable ||
            (runEnded && state === CHAT_PART_STATE.inputAvailable)
          ? toolText?.done
          : toolText?.running;
    if (name === BROWSER_TOOL_NAME.startSubAgent)
      return subAgentTitle(base, output, toolText, t);
    if (
      name === BROWSER_TOOL_NAME.manageTabs &&
      input.operation === "group" &&
      state === CHAT_PART_STATE.outputAvailable &&
      typeof input.title === "string"
    )
      return `${base || toolLabel(name, t)}: ${input.title}`;
    return base || toolLabel(name, t);
  })();
  const detail = (() => {
    if (
      typeof output.error === "string" &&
      name === BROWSER_TOOL_NAME.readUploadedAttachment
    )
      return compactJoin([
        output.error,
        stringValue(output.attachmentId) || stringValue(input.attachmentId),
      ]);
    if (typeof output.error === "string") return toolErrorMessage(output, t);
    if (name.startsWith("mcp__")) return mcpToolDetail(input, output);
    if (typeof input.reason === "string") return input.reason;
    if (name === BROWSER_TOOL_NAME.getCurrentTime)
      return compactJoin([
        stringValue(output.localDateTime),
        stringValue(output.timeZone),
      ]);
    if (name === BROWSER_TOOL_NAME.question)
      return questionToolDetail(input, output, state, runEnded, t);
    if (
      name === BROWSER_TOOL_NAME.startSubAgent ||
      name === BROWSER_TOOL_NAME.getSubAgentStatus
    )
      return subAgentDetail(input, output, t, toolText?.running);
    if (
      name === BROWSER_TOOL_NAME.manageLocalExecutionBridges &&
      Array.isArray(output.bridges)
    )
      return formatToolMessage(toolFound, {
        count: (output.bridges as unknown[]).length,
      });
    if (name === BROWSER_TOOL_NAME.manageLocalExecutionBridges)
      return compactJoin([
        stringValue(input.operation || "list"),
        stringValue(output.error),
      ]);
    if (
      name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
      name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
      name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge
    )
      return compactJoin([
        stringValue(
          (output.agent as Record<string, unknown> | undefined)?.name,
        ) ||
          stringValue(input.name) ||
          stringValue(input.agentName) ||
          stringValue(input.agentId) ||
          stringValue(output.agentId),
        localExecutionBridgeStateLabel(stringValue(output.state), t),
        stringValue(output.error),
      ]);
    if (name === BROWSER_TOOL_NAME.getCurrentTab)
      return compactJoin([
        idLabel("Tab", output.tabId),
        shortValue(stringValue(output.title), TOOL_DETAIL_TITLE_MAX_LENGTH),
        shortUrl(output.url),
      ]);
    if (name === BROWSER_TOOL_NAME.inspectPage)
      return pageInspectionDetail(input, output, toolFound);
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return compactJoin([
        stringValue(output.name) || stringValue(input.attachmentId),
        stringValue(output.encoding),
        rangeLabel(output),
      ]);
    if (name === BROWSER_TOOL_NAME.manageSkills && Array.isArray(output.skills))
      return formatToolMessage(toolFound, {
        count: (output.skills as unknown[]).length,
      });
    if (
      name === BROWSER_TOOL_NAME.loadTools &&
      Array.isArray(output.loadedToolNames)
    )
      return compactJoin([
        formatToolMessage(toolFound, {
          count: (output.loadedToolNames as unknown[]).length,
        }),
        (output.loadedToolNames as unknown[]).map(String).join(", "),
      ]);
    if (name === BROWSER_TOOL_NAME.manageSkills && input.operation === "create")
      return stringValue(output.name) || stringValue(input.name);
    if (name === BROWSER_TOOL_NAME.manageSkills && input.operation === "read")
      return stringValue(output.name) || stringValue(input.skillId);
    if (
      name === BROWSER_TOOL_NAME.manageSkills &&
      input.operation === "readFile"
    )
      return compactJoin([
        stringValue(output.name) || stringValue(input.skillId),
        stringValue(output.path) || stringValue(input.path),
      ]);
    if (
      name === BROWSER_TOOL_NAME.manageSkills &&
      (input.operation === "updateFile" || input.operation === "patchFile")
    )
      return compactJoin([
        stringValue(output.name) || stringValue(input.skillId),
        stringValue(output.path) || stringValue(input.path),
      ]);
    if (
      name === BROWSER_TOOL_NAME.workspaceFiles &&
      input.operation === "list" &&
      Array.isArray(output.files)
    )
      return `${(output.files as unknown[]).length} files`;
    if (
      name === BROWSER_TOOL_NAME.workspaceFiles &&
      ["read", "write", "patch", "delete"].includes(
        stringValue(input.operation),
      )
    )
      return stringValue(output.path) || stringValue(input.path);
    if (
      name === BROWSER_TOOL_NAME.workspaceFiles &&
      input.operation === "search" &&
      Array.isArray(output.results)
    )
      return compactJoin([
        stringValue(output.query) || stringValue(input.query),
        `${(output.results as unknown[]).length} matches`,
      ]);
    if (isMemoryToolName(name) && Array.isArray(output.entries))
      return `${(output.entries as unknown[]).length} entries`;
    if (isMemoryToolName(name))
      return compactJoin([
        stringValue(
          (output.entry as Record<string, unknown> | undefined)?.id,
        ) || stringValue(input.id),
        stringValue(output.path),
      ]);
    if (
      name === BROWSER_TOOL_NAME.manageChatHistory &&
      input.operation === "search" &&
      Array.isArray(output.results)
    )
      return compactJoin([
        stringValue(output.query) || stringValue(input.query),
        `${(output.results as unknown[]).length} chats`,
      ]);
    if (
      name === BROWSER_TOOL_NAME.manageChatHistory &&
      (input.operation === "read" || input.operation === "delete")
    )
      return stringValue(output.title) || stringValue(input.chatId);
    if (
      name === BROWSER_TOOL_NAME.manageMcpServers &&
      input.operation === "list" &&
      Array.isArray(output.servers)
    )
      return `${(output.servers as unknown[]).length} MCP`;
    if (
      name === BROWSER_TOOL_NAME.manageMcpServers &&
      ["add", "update", "delete", "test"].includes(stringValue(input.operation))
    )
      return compactJoin([
        stringValue(
          (output.server as Record<string, unknown> | undefined)?.name,
        ) ||
          stringValue(input.name) ||
          stringValue(input.serverId),
        stringValue(
          (output.server as Record<string, unknown> | undefined)?.url,
        ) || stringValue(input.url),
      ]);
    if (name === BROWSER_TOOL_NAME.manageTabs)
      return manageTabsDetail(input, output, outputValue, toolFound);
    if (name === BROWSER_TOOL_NAME.captureVisibleTab)
      return compactJoin([
        idLabel("Tab", output.tabId || input.tabId),
        stringValue(output.format || input.format || "png"),
      ]);
    if (name === BROWSER_TOOL_NAME.mutatePage)
      return compactJoin([
        Array.isArray(input.operations)
          ? `${(input.operations as unknown[]).length} mutations`
          : stringValue(input.operation || output.operation),
        idLabel("Tab", output.tabId || input.tabId),
        stringValue(input.value || input.text || input.attribute),
      ]);
    if (typeof output.filename === "string") return output.filename;
    if (name === BROWSER_TOOL_NAME.generateImage)
      return stringValue(output.revisedPrompt) || stringValue(input.prompt);
    const fallback = fallbackToolDetail(name, input, output);
    if (fallback) return fallback;
    if (part.state === CHAT_PART_STATE.outputError) return t.sidepanel.error;
    return "";
  })();
  const description = shortValue(
    detail || genericToolDetail(name, input, output),
    TOOL_DETAIL_DESCRIPTION_MAX_LENGTH,
  );
  const references = toolReferences(name, output, input);
  const subAgentProgress = subAgentProgressDetail(name, output, t, toolLabel);
  return { title, description, references, subAgentProgress };
}

function questionToolDetail(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  state: ChatPart["state"],
  runEnded: boolean,
  t: Messages,
) {
  if (Array.isArray(output.answers))
    return `${output.answers.length} answers submitted`;
  const questions = Array.isArray(input.questions) ? input.questions : [];
  if (questionToolAwaitingAnswer(output) && !runEnded)
    return t.sidepanel.questionWaiting;
  return `${questions.length} questions`;
}

function questionToolAwaitingAnswer(output: Record<string, unknown>) {
  return !Array.isArray(output.answers) || output.answers.length === 0;
}

function fallbackToolDetail(
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  if (name === BROWSER_TOOL_NAME.wait)
    return stringValue(output.milliseconds || input.milliseconds || input.ms);
  if (name === BROWSER_TOOL_NAME.downloadAllImagesInTab)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.downloadTabToMarkdown)
    return idLabel("Tab", input.tabId);
  if (name.startsWith("cdp")) return cdpToolDetail(name, input, output);
  return "";
}

function manageTabsDetail(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  outputValue: unknown,
  toolFound: string | undefined,
) {
  const operation = stringValue(input.operation || output.operation) || "list";
  if (operation === "list" && Array.isArray(output.tabs))
    return formatToolMessage(toolFound, { count: output.tabs.length });
  if (operation === "list" && Array.isArray(outputValue))
    return formatToolMessage(toolFound, { count: outputValue.length });
  if (operation === "open")
    return shortUrl(
      output.tab && typeof output.tab === "object"
        ? (output.tab as Record<string, unknown>).url
        : input.url,
    );
  if (operation === "search") return stringValue(input.query);
  if (operation === "focus") return idLabel("Tab", output.tabId || input.tabId);
  if (operation === "close")
    return arrayLabel("Tabs", input.tabIds || input.tabId);
  if (operation === "group") return arrayLabel("Tabs", input.tabIds);
  if (operation === "navigate")
    return compactJoin([
      stringValue(output.type || input.type || (input.url ? "url" : "reload")),
      shortUrl(input.url),
      idLabel("Tab", output.tabId || input.tabId),
    ]);
  return operation;
}

function pageInspectionDetail(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  toolFound: string | undefined,
) {
  const pages = Array.isArray(output.pages) ? output.pages : [];
  const first = pages[0] as Record<string, unknown> | undefined;
  if (!first) return arrayLabel("Tabs", input.tabIds || input.tabId);
  const counts = [
    Array.isArray(first.elements)
      ? formatToolMessage(toolFound, { count: first.elements.length })
      : "",
    Array.isArray(first.images) ? `${first.images.length} images` : "",
    Array.isArray(first.links) ? `${first.links.length} links` : "",
    Array.isArray(first.blocks) ? `${first.blocks.length} blocks` : "",
  ];
  return compactJoin([
    idLabel("Tab", first.tabId || input.tabId),
    shortValue(
      stringValue(first.title) || stringValue(first.url),
      TOOL_DETAIL_TITLE_MAX_LENGTH,
    ),
    pages.length > 1 ? `${pages.length} tabs` : "",
    rangeLabel(first) || contentLengthLabel(first.markdown),
    compactJoin(counts),
  ]);
}

function genericToolDetail(
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  return (
    compactJoin([recordSummary(output), recordSummary(input)]) ||
    humanizeToolName(name)
  );
}

function recordSummary(record: Record<string, unknown>) {
  const entries = Object.entries(record)
    .filter(([key, value]) => isSummaryValue(key, value))
    .slice(0, 2)
    .map(
      ([key, value]) =>
        `${key}: ${shortValue(value, TOOL_DETAIL_VALUE_MAX_LENGTH)}`,
    );
  return entries.join(" · ");
}

function isSummaryValue(key: string, value: unknown) {
  if (value === null || value === undefined) return false;
  if (["markdown", "content", "dataUrl", "base64", "image"].includes(key))
    return false;
  if (typeof value === "string") return !!value.trim();
  return typeof value === "number" || typeof value === "boolean";
}

function mcpToolDetail(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  const params = Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) => mcpParamLabel(key, value))
    .filter(Boolean)
    .join(" · ");
  if (typeof output.error === "string") return compactJoin([params, "error"]);
  const result = output.result as Record<string, unknown> | undefined;
  const content = Array.isArray(result?.content) ? result.content : [];
  const textCount = content.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).text === "string" &&
      !!String((item as Record<string, unknown>).text).trim(),
  ).length;
  return compactJoin([
    params,
    textCount
      ? `${textCount} text result${textCount === 1 ? "" : "s"}`
      : content.length
        ? `${content.length} result item${content.length === 1 ? "" : "s"}`
        : "",
  ]);
}

function mcpParamLabel(key: string, value: unknown) {
  if (Array.isArray(value)) {
    if (key.toLowerCase().includes("url"))
      return `${value.length} URL${value.length === 1 ? "" : "s"}`;
    return `${key}: ${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "number") return `${key}: ${value}`;
  if (typeof value === "boolean") return `${key}: ${value ? "on" : "off"}`;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return `${key}: URL`;
    return `${key}: ${shortValue(value, TOOL_DETAIL_VALUE_MAX_LENGTH)}`;
  }
  return `${key}: ${shortValue(value, TOOL_DETAIL_VALUE_MAX_LENGTH)}`;
}

function toolErrorMessage(output: Record<string, unknown>, t: Messages) {
  const error = String(output.error || "");
  const message = t.sidepanel.toolErrors[error as ToolErrorCode];
  if (!message) return error;
  return formatToolMessage(message, {
    tool: stringValue(output.toolName),
    type: stringValue(output.type),
  });
}

function compactJsonValue(value: unknown): unknown {
  if (typeof value === "string")
    return value.length > 4000 ? `${value.slice(0, 4000)}...` : value;
  if (Array.isArray(value)) return value.map(compactJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      compactJsonValue(item),
    ]),
  );
}

function shortValue(value: unknown, maxLength = 140) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
function localExecutionBridgeStateLabel(state: string, t: Messages) {
  if (!state) return "";
  const labels = t.sidepanel.localExecutionBridgeStates;
  return labels[state as keyof typeof labels] || state;
}
function shortUrl(value: unknown) {
  const text = stringValue(value);
  if (!text) return "";
  return shortValue(
    text.replace(/^https?:\/\//i, ""),
    TOOL_DETAIL_URL_MAX_LENGTH,
  );
}
function idLabel(label: string, value: unknown) {
  const text =
    stringValue(value) || (Number.isFinite(Number(value)) ? String(value) : "");
  return text ? `${label} ${text}` : "";
}
function arrayLabel(label: string, value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const text = items.map(String).filter(Boolean).join(", ");
  return text ? `${label} ${text}` : "";
}
function compactJoin(values: Array<string | undefined>) {
  return values.filter(Boolean).join(" · ");
}
function rangeLabel(output: Record<string, unknown>) {
  const offset = Number(output.offset);
  const limit = Number(output.limit);
  const total = Number(output.totalLength);
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return "";
  const end = offset + limit;
  return Number.isFinite(total)
    ? `${offset}-${Math.min(end, total)} / ${total}`
    : `${offset}-${end}`;
}
function contentLengthLabel(value: unknown) {
  return typeof value === "string" ? `${value.length} chars` : "";
}
function toolLabel(name: string, t: Messages) {
  const toolText = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  return toolText?.done || toolText?.running || humanizeToolName(name);
}
function humanizeToolName(name: string) {
  if (!name.startsWith("cdp")) return name;
  return `CDP ${name
    .slice(3)
    .replace(/ByAiID$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")}`;
}
