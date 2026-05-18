import { Check, Copy } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  COPY_FEEDBACK_MS,
  STREAM_RENDER_THROTTLE_MS,
} from "../../src/shared/config";
import { getMessages, type Messages } from "../../src/shared/i18n";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type { ChatPart, ChatSource } from "../../src/shared/types";
import { isToolPartType } from "../../src/shared/types";
import { storage } from "../../src/shared/storage";
import { Button } from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { IconTooltip } from "./icon-tooltip";
import { renderMarkdown } from "./markdown";
import { ToolPart } from "./tool-part";
import { useThrottledText } from "./use-throttled-text";

export function AssistantPart({
  t,
  part,
  sources,
}: {
  t: Messages;
  part: ChatPart;
  sources: ChatSource[];
}) {
  if (isToolPartType(part.type)) return <ToolPart t={t} part={part} />;
  if (part.type === "text" && part.text?.trim())
    return <AssistantText text={part.text} sources={sources} />;
  return null;
}

export function AssistantText({
  text,
  modelLabel,
  createdAt,
  sources = [],
}: {
  text: string;
  modelLabel?: string;
  createdAt?: number;
  sources?: ChatSource[];
}) {
  const [language] = useStoredState(storage.language);
  const [copied, setCopied] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const markdownRef = useRef<HTMLDivElement | null>(null);
  const t = getMessages(language);
  const displayText = useThrottledText(text, STREAM_RENDER_THROTTLE_MS);
  const { html, codeBlocks } = renderMarkdown(
    displayText,
    t,
    copiedCodeId,
    sources,
  );
  const streaming = displayText.length < text.length;

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (!copiedCodeId) return undefined;
    const timeout = window.setTimeout(
      () => setCopiedCodeId(null),
      COPY_FEEDBACK_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [copiedCodeId]);

  useEffect(() => {
    const element = markdownRef.current;
    if (!element) return undefined;
    const handler = (event: MouseEvent) => {
      const citation = (event.target as HTMLElement | null)?.closest(
        "button[data-source-id]",
      ) as HTMLButtonElement | null;
      if (!citation) return;
      event.preventDefault();
      event.stopPropagation();
      openCitationSource(citation.dataset.sourceId || "", sources);
    };
    element.addEventListener("click", handler);
    return () => element.removeEventListener("click", handler);
  }, [sources]);

  async function handleMarkdownClick(event: React.MouseEvent<HTMLDivElement>) {
    const citation = (event.target as HTMLElement | null)?.closest(
      "button[data-source-id]",
    ) as HTMLButtonElement | null;
    if (citation) {
      event.preventDefault();
      event.stopPropagation();
      openCitationSource(citation.dataset.sourceId || "", sources);
      return;
    }
    const button = (event.target as HTMLElement | null)?.closest(
      "button[data-code-index]",
    ) as HTMLButtonElement | null;
    if (!button) return;
    const codeIndex = Number(button.dataset.codeIndex);
    const code = codeBlocks[codeIndex];
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedCodeId(button.dataset.codeId || null);
  }

  function copyText() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  return (
    <div className={`assistant-text${streaming ? " streaming" : ""}`}>
      <div
        ref={markdownRef}
        className="markdown"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleMarkdownClick}
      />
      <div className="assistant-actions">
        <IconTooltip label={copied ? t.common.copied : t.common.copy}>
          <Button
            variant="ghost"
            size="icon"
            className={`copy-message${copied ? " copied" : ""}`}
            onClick={copyText}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </Button>
        </IconTooltip>
        {(modelLabel || createdAt) && (
          <span className="assistant-model-meta">
            {[modelLabel, createdAt ? formatMessageTime(createdAt) : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

function openCitationSource(sourceId: string, sources: ChatSource[]) {
  const source = sources.find((item) => item.id === sourceId);
  if (!source) return;
  if (source.url) {
    openOrFocusUrl(source.url).catch(() => undefined);
    return;
  }
  if (source.tabId) focusTab(source.tabId).catch(() => undefined);
}

function formatMessageTime(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
