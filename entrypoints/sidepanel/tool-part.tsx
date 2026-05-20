import React from "react";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import type { Messages } from "../../src/shared/i18n";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import {
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
} from "../../src/shared/types";
import type { ChatPart } from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/ui/components";
import { cdpToolDetail } from "./cdp-tool-detail";
import { formatToolMessage } from "./format";
import { isMemoryToolName, toolIcon } from "./tool-icons";
import { CapturedTabImage, GeneratedImage } from "./tool-media";
import { toolReferences, type ToolReference } from "./tool-references";

export function ToolPart({
  t,
  part,
  runEnded = false,
}: {
  t: Messages;
  part: ChatPart;
  runEnded?: boolean;
}) {
  if (!isToolPartType(part.type)) return null;
  const name = part.toolName || toolNameFromPartType(part.type);
  const { title, description, references } = toolDisplay(
    name,
    part,
    t,
    runEnded,
  );
  const loading =
    !runEnded &&
    (part.state === CHAT_PART_STATE.inputStreaming ||
      part.state === CHAT_PART_STATE.inputAvailable);
  const isError = part.state === CHAT_PART_STATE.outputError;
  const isDone = part.state === CHAT_PART_STATE.outputAvailable;
  const status = loading
    ? "loading"
    : isError
      ? "error"
      : isDone
        ? "done"
        : "idle";
  const detailKey = [
    status,
    title,
    description,
    references.map((reference) => reference.title).join("|"),
  ].join("::");
  return (
    <div className={`tool-card ${status}`}>
      <Popover>
        <PopoverTrigger asChild>
          <button className="tool-title tool-title-button" type="button">
            <span className="tool-icon">{toolIcon(name)}</span>
            <strong className="tool-title-text" key={title}>
              {loading ? <span className="shiny-text">{title}</span> : title}
            </strong>
          </button>
        </PopoverTrigger>
        <PopoverContent className="tool-json-popover" align="start">
          <pre>{toolJsonDetail(name, part)}</pre>
        </PopoverContent>
      </Popover>
      <div className="tool-detail">
        <div className="tool-detail-content" key={detailKey}>
          {name === BROWSER_TOOL_NAME.generateImage && (
            <GeneratedImage
              output={(part.output || {}) as Record<string, unknown>}
              loading={loading}
              t={t}
            />
          )}
          {name === BROWSER_TOOL_NAME.captureVisibleTab && (
            <CapturedTabImage
              output={(part.output || {}) as Record<string, unknown>}
              t={t}
            />
          )}
          {description && <div className="tool-description">{description}</div>}
          {!!references.length && (
            <div className="tool-references">
              {references.map((reference, index) => (
                <ToolReferenceButton
                  key={reference.title}
                  reference={reference}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function toolJsonDetail(name: string, part: ChatPart) {
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

function ToolReferenceButton({
  reference,
  index,
}: {
  reference: ToolReference;
  index: number;
}) {
  const url = reference.url;
  return (
    <Button
      variant="ghost"
      onClick={url ? () => openOrFocusUrl(url).catch(console.warn) : undefined}
      style={{ "--tool-reference-index": index } as React.CSSProperties}
    >
      {reference.icon}
      <span>{reference.title}</span>
    </Button>
  );
}

function toolDisplay(
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
      state === CHAT_PART_STATE.outputAvailable ||
      (runEnded && state === CHAT_PART_STATE.inputAvailable)
        ? toolText?.done
        : toolText?.running;
    if (
      name === BROWSER_TOOL_NAME.groupTabs &&
      state === CHAT_PART_STATE.outputAvailable &&
      typeof input.title === "string"
    )
      return `${base || toolLabel(name, t)}: ${input.title}`;
    return base || toolLabel(name, t);
  })();
  const description = (() => {
    if (
      typeof output.error === "string" &&
      name === BROWSER_TOOL_NAME.readUploadedAttachment
    )
      return compactJoin([
        output.error,
        stringValue(output.attachmentId) || stringValue(input.attachmentId),
      ]);
    if (typeof output.error === "string") return output.error;
    if (name.startsWith("mcp__")) return mcpToolDetail(input, output);
    if (typeof input.reason === "string") return input.reason;
    if (name === BROWSER_TOOL_NAME.getCurrentTime)
      return compactJoin([
        stringValue(output.localDateTime),
        stringValue(output.timeZone),
      ]);
    if (name === BROWSER_TOOL_NAME.readUploadedAttachment)
      return compactJoin([
        stringValue(output.name) || stringValue(input.attachmentId),
        stringValue(output.encoding),
        rangeLabel(output),
      ]);
    if (name === BROWSER_TOOL_NAME.listSkills && Array.isArray(output.skills))
      return formatToolMessage(toolFound, { count: output.skills.length });
    if (
      name === BROWSER_TOOL_NAME.loadBrowserTools &&
      Array.isArray(output.loadedToolNames)
    )
      return compactJoin([
        formatToolMessage(toolFound, { count: output.loadedToolNames.length }),
        output.loadedToolNames.map(String).join(", "),
      ]);
    if (name === BROWSER_TOOL_NAME.createSkill)
      return stringValue(output.name) || stringValue(input.name);
    if (name === BROWSER_TOOL_NAME.readSkill)
      return stringValue(output.name) || stringValue(input.skillId);
    if (name === BROWSER_TOOL_NAME.readSkillFile)
      return compactJoin([
        stringValue(output.name) || stringValue(input.skillId),
        stringValue(output.path) || stringValue(input.path),
      ]);
    if (
      name === BROWSER_TOOL_NAME.updateSkillFile ||
      name === BROWSER_TOOL_NAME.patchSkillFile
    )
      return compactJoin([
        stringValue(output.name) || stringValue(input.skillId),
        stringValue(output.path) || stringValue(input.path),
      ]);
    if (
      name === BROWSER_TOOL_NAME.listWorkspaceFiles &&
      Array.isArray(output.files)
    )
      return `${output.files.length} files`;
    if (
      name === BROWSER_TOOL_NAME.readWorkspaceFile ||
      name === BROWSER_TOOL_NAME.writeWorkspaceFile ||
      name === BROWSER_TOOL_NAME.patchWorkspaceFile ||
      name === BROWSER_TOOL_NAME.deleteWorkspaceFile
    )
      return stringValue(output.path) || stringValue(input.path);
    if (
      name === BROWSER_TOOL_NAME.searchWorkspaceFiles &&
      Array.isArray(output.results)
    )
      return compactJoin([
        stringValue(output.query) || stringValue(input.query),
        `${output.results.length} matches`,
      ]);
    if (isMemoryToolName(name) && Array.isArray(output.entries))
      return `${output.entries.length} entries`;
    if (isMemoryToolName(name))
      return compactJoin([
        stringValue(
          (output.entry as Record<string, unknown> | undefined)?.id,
        ) || stringValue(input.id),
        stringValue(output.path),
      ]);
    if (
      name === BROWSER_TOOL_NAME.searchChatHistory &&
      Array.isArray(output.results)
    )
      return compactJoin([
        stringValue(output.query) || stringValue(input.query),
        `${output.results.length} chats`,
      ]);
    if (
      name === BROWSER_TOOL_NAME.readChatThread ||
      name === BROWSER_TOOL_NAME.deleteChatThread
    )
      return stringValue(output.title) || stringValue(input.chatId);
    if (
      name === BROWSER_TOOL_NAME.listMcpServers &&
      Array.isArray(output.servers)
    )
      return `${output.servers.length} MCP`;
    if (
      name === BROWSER_TOOL_NAME.addMcpServer ||
      name === BROWSER_TOOL_NAME.updateMcpServer ||
      name === BROWSER_TOOL_NAME.deleteMcpServer
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
    if (
      name === BROWSER_TOOL_NAME.findAccessableElementsFromTab &&
      Array.isArray(output.elements)
    )
      return compactJoin([
        idLabel("Tab", input.tabId),
        formatToolMessage(toolFound, { count: output.elements.length }),
      ]);
    if (name === BROWSER_TOOL_NAME.getAllTabs && Array.isArray(outputValue))
      return formatToolMessage(toolFound, { count: outputValue.length });
    if (name === BROWSER_TOOL_NAME.navigateTab)
      return compactJoin([
        stringValue(
          output.type || input.type || (input.url ? "url" : "reload"),
        ),
        stringValue(input.url),
        idLabel("Tab", output.tabId || input.tabId),
      ]);
    if (name === BROWSER_TOOL_NAME.reloadTab)
      return idLabel("Tab", output.tabId || input.tabId);
    if (name === BROWSER_TOOL_NAME.captureVisibleTab)
      return compactJoin([
        idLabel("Tab", output.tabId || input.tabId),
        stringValue(output.format || input.format || "png"),
      ]);
    if (name === BROWSER_TOOL_NAME.waitForText)
      return compactJoin([
        stringValue(output.text),
        idLabel("Tab", output.tabId || input.tabId),
      ]);
    if (
      name === BROWSER_TOOL_NAME.inputTextByAiID &&
      typeof input.text === "string"
    )
      return compactJoin([
        idLabel("Tab", input.tabId),
        stringValue(input.id),
        input.text,
      ]);
    if (typeof output.filename === "string") return output.filename;
    if (name === BROWSER_TOOL_NAME.generateImage)
      return stringValue(output.revisedPrompt) || stringValue(input.prompt);
    const fallback = fallbackToolDetail(name, input, output);
    if (fallback) return fallback;
    if (part.state === CHAT_PART_STATE.outputError) return t.sidepanel.error;
    return "";
  })();
  const references = toolReferences(name, output, input);
  return { title, description, references };
}

function fallbackToolDetail(
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  if (name === BROWSER_TOOL_NAME.openNewTabWithURL)
    return stringValue(
      output.tab && typeof output.tab === "object"
        ? (output.tab as Record<string, unknown>).url
        : input.url,
    );
  if (name === BROWSER_TOOL_NAME.openSearchTab) return stringValue(input.query);
  if (name === BROWSER_TOOL_NAME.wait)
    return stringValue(output.milliseconds || input.milliseconds || input.ms);
  if (name === BROWSER_TOOL_NAME.goToTab) return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.waitTabLoadFinished)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.scrollToBottom)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.closeTab)
    return arrayLabel("Tabs", input.tabIds || input.tabId);
  if (name === BROWSER_TOOL_NAME.getTabContent)
    return arrayLabel("Tabs", input.tabIds || input.tabId);
  if (name === BROWSER_TOOL_NAME.downloadAllImagesInTab)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.downloadTabToMarkdown)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.insertCSSToTab)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.removeCSSToTab)
    return idLabel("Tab", input.tabId);
  if (name === BROWSER_TOOL_NAME.clickElementByAiID)
    return compactJoin([idLabel("Tab", input.tabId), stringValue(input.id)]);
  if (name === BROWSER_TOOL_NAME.getElementPropertiesByAiID)
    return compactJoin([
      idLabel("Tab", input.tabId),
      arrayLabel("Elements", input.ids || input.id),
    ]);
  if (name === BROWSER_TOOL_NAME.groupTabs)
    return arrayLabel("Tabs", input.tabIds);
  if (name.startsWith("cdp")) return cdpToolDetail(name, input, output);
  return "";
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
    return `${key}: ${shortValue(value, 72)}`;
  }
  return `${key}: ${shortValue(value, 72)}`;
}

function shortValue(value: unknown, maxLength = 140) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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
