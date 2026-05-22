import React from "react";
import { CornerDownRight } from "lucide-react";
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
import { toolDisplay, toolJsonDetail } from "./tool-part-detail";
import { toolIcon } from "./tool-icons";
import { CapturedTabImage, GeneratedImage } from "./tool-media";
import type { ToolReference } from "./tool-references";

export function ToolPart({
  t,
  part,
  runEnded = false,
  onSelectChat,
}: {
  t: Messages;
  part: ChatPart;
  runEnded?: boolean;
  onSelectChat?: (chatId: string) => void;
}) {
  if (!isToolPartType(part.type)) return null;
  const name = part.toolName || toolNameFromPartType(part.type);
  const { title, description, references, subAgentProgress } = toolDisplay(
    name,
    part,
    t,
    runEnded,
  );
  const output = (part.output || {}) as Record<string, unknown>;
  const subAgentRunning = isSubAgentTool(name) && output.state === "running";
  const loading =
    !runEnded &&
    (subAgentRunning ||
      part.state === CHAT_PART_STATE.inputStreaming ||
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
  const subAgentChatId = subAgentChildChatId(name, part);
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
          <pre className="ui-code-surface">{toolJsonDetail(name, part)}</pre>
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
          {isSubAgentTool(name) && (
            <div
              className={`tool-detail-slot ${subAgentProgress ? "visible" : ""}`}
              aria-hidden={!subAgentProgress}
            >
              <div
                className="tool-description tool-detail-slot-content"
                key={subAgentProgress}
              >
                {subAgentProgress}
              </div>
            </div>
          )}
          {subAgentChatId && (
            <Button
              className="tool-subagent-link"
              variant="secondary"
              size="sm"
              onClick={() => onSelectChat?.(subAgentChatId)}
            >
              <CornerDownRight size={14} />
              <span>{t.sidepanel.openSubAgentChat}</span>
            </Button>
          )}
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

function isSubAgentTool(name: string) {
  return (
    name === BROWSER_TOOL_NAME.startSubAgent ||
    name === BROWSER_TOOL_NAME.getSubAgentStatus
  );
}

function subAgentChildChatId(name: string, part: ChatPart) {
  if (!isSubAgentTool(name)) return undefined;
  const output = part.output as Record<string, unknown> | undefined;
  if (output?.state === "missing") return undefined;
  const childChatId = String(
    output?.childChatId || output?.taskId || "",
  ).trim();
  return childChatId || undefined;
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
