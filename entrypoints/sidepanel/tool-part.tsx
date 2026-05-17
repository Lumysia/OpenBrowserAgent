import {
  Download,
  ExternalLink,
  FileText,
  Layers,
  MousePointerClick,
  Search,
  Square,
  Type,
} from "lucide-react";
import React from "react";
import { BROWSER_TOOL_NAME } from "../../src/shared/browser-tools";
import type { Messages } from "../../src/shared/i18n";
import {
  CHAT_PART_STATE,
  isToolPartType,
  toolNameFromPartType,
} from "../../src/shared/types";
import type { ChatPart } from "../../src/shared/types";
import { formatToolMessage } from "./format";

export function ToolPart({ t, part }: { t: Messages; part: ChatPart }) {
  if (!isToolPartType(part.type)) return null;
  const name = part.toolName || toolNameFromPartType(part.type);
  const { title, description, references } = toolDisplay(name, part, t);
  const loading =
    part.state === CHAT_PART_STATE.inputStreaming ||
    part.state === CHAT_PART_STATE.inputAvailable;
  const isError = part.state === CHAT_PART_STATE.outputError;
  return (
    <div
      className={`tool-card ${loading ? "loading" : ""} ${isError ? "error" : ""}`}
    >
      <div className="tool-title">
        <span className="tool-icon">{toolIcon(name)}</span>
        <strong>
          {loading ? <span className="shiny-text">{title}</span> : title}
        </strong>
      </div>
      <div className="tool-detail">
        {description && <div className="tool-description">{description}</div>}
        {!!references.length && (
          <div className="tool-references">
            {references.map((reference) => (
              <button
                key={reference.title}
                onClick={
                  reference.url
                    ? () => chrome.tabs.create({ url: reference.url })
                    : undefined
                }
              >
                {reference.icon}
                <span>{reference.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toolDisplay(name: string, part: ChatPart, t: Messages) {
  const input = (part.input || {}) as Record<string, unknown>;
  const outputValue = part.output;
  const output = (outputValue || {}) as Record<string, unknown>;
  const state = part.state;
  const toolText = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  const toolFound = (toolText as { found?: string } | undefined)?.found;
  const title = (() => {
    const base =
      state === CHAT_PART_STATE.outputAvailable
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
    if (typeof output.error === "string") return output.error;
    if (typeof input.reason === "string") return input.reason;
    if (
      name === BROWSER_TOOL_NAME.findAccessableElementsFromTab &&
      Array.isArray(output.elements)
    )
      return formatToolMessage(toolFound, { count: output.elements.length });
    if (name === BROWSER_TOOL_NAME.getAllTabs && Array.isArray(outputValue))
      return formatToolMessage(toolFound, { count: outputValue.length });
    if (
      name === BROWSER_TOOL_NAME.inputTextByAiID &&
      typeof input.text === "string"
    )
      return input.text;
    if (typeof output.filename === "string") return output.filename;
    if (part.state === CHAT_PART_STATE.outputError) return t.sidepanel.error;
    return "";
  })();
  const references = toolReferences(name, output, input);
  return { title, description, references };
}

function toolReferences(
  name: string,
  output: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  const references: Array<{
    title: string;
    url?: string;
    icon: React.ReactNode;
  }> = [];
  if (
    name === BROWSER_TOOL_NAME.openNewTabWithURL &&
    output.tab &&
    typeof output.tab === "object"
  ) {
    const tab = output.tab as { title?: string; url?: string };
    if (tab.title)
      references.push({
        title: tab.title,
        url: tab.url,
        icon: <ExternalLink size={14} />,
      });
    return references;
  }
  if (
    name === BROWSER_TOOL_NAME.getTabContent &&
    Array.isArray(output.contents)
  ) {
    return output.contents
      .map((item) => item as { title?: string; url?: string })
      .filter((item) => item.title)
      .map((item) => ({
        title: item.title || "",
        url: item.url,
        icon: <ExternalLink size={14} />,
      }));
  }
  if (
    name === BROWSER_TOOL_NAME.openSearchTab &&
    typeof input.query === "string"
  )
    references.push({ title: input.query, icon: <Search size={14} /> });
  return references;
}

function toolIcon(name: string) {
  if (name.includes("input")) return <Type size={19} strokeWidth={2.1} />;
  if (name.includes("click"))
    return <MousePointerClick size={19} strokeWidth={2.1} />;
  if (name.includes("find")) return <Search size={19} strokeWidth={2.1} />;
  if (name.includes("download"))
    return <Download size={19} strokeWidth={2.1} />;
  if (name.includes("Content")) return <FileText size={19} strokeWidth={2.1} />;
  if (name.includes("group")) return <Layers size={19} strokeWidth={2.1} />;
  if (name.includes("Tab")) return <ExternalLink size={19} strokeWidth={2.1} />;
  return <Square size={15} strokeWidth={2.1} />;
}

function toolLabel(name: string, t: Messages) {
  const toolText = t.sidepanel.tool[name as keyof typeof t.sidepanel.tool];
  return toolText?.done || toolText?.running || name;
}
