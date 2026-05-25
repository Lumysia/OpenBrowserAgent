import { Brain, Check, Copy, GitBranch } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  COPY_FEEDBACK_MS,
  STREAM_RENDER_THROTTLE_MS,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { getBrowserApi } from "../../src/shared/storage";
import { focusTab, openOrFocusUrl } from "../../src/shared/tab-navigation";
import type {
  ChatMessage,
  ChatPart,
  ChatSource,
  QuestionToolAnswer,
} from "../../src/shared/types";
import { CHAT_PART_STATE, isToolPartType } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
} from "../../src/ui/components";
import { formatMessageTime } from "./format";
import { IconTooltip } from "./icon-tooltip";
import { renderMarkdown } from "./markdown";
import { MessageRunInfo } from "./message-run-info";
import { ToolPart } from "./tool-part";
import { useThrottledText } from "./use-throttled-text";

export function AssistantSummaryCard({
  t,
  message,
  summary: summaryProp,
}: {
  t: Messages;
  message?: ChatMessage;
  summary?: string;
}) {
  const summary =
    summaryProp?.trim() || (message ? compactionSummary(message) : "");
  if (!summary) return null;
  return (
    <div className="tool-card done context-summary-card">
      <div className="tool-title">
        <span className="tool-icon">
          <Brain />
        </span>
        <strong className="tool-title-text">
          {t.sidepanel.contextSummaryTitle}
        </strong>
      </div>
      <div className="tool-detail">
        <div className="tool-detail-content">
          <div className="tool-description context-summary-description">
            {t.sidepanel.contextSummaryDescription}
          </div>
          <pre className="context-summary-text">{summary}</pre>
        </div>
      </div>
    </div>
  );
}

function compactionSummary(message: ChatMessage) {
  const metrics = message.metadata?.runMetrics as
    | { contextBudget?: { compactionSummary?: unknown } }
    | undefined;
  const summary = metrics?.contextBudget?.compactionSummary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : "";
}

export function AssistantPart({
  t,
  part,
  partIndex,
  sources,
  onFork,
  message,
  chatMessages,
  onSelectChat,
  chatExists,
  onAnswerQuestion,
}: {
  t: Messages;
  part: ChatPart;
  partIndex: number;
  sources: ChatSource[];
  onFork?: () => void;
  message: ChatMessage;
  chatMessages: ChatMessage[];
  onSelectChat?: (chatId: string) => void;
  chatExists: (chatId: string) => boolean;
  onAnswerQuestion?: (
    toolCallId: string,
    answers: QuestionToolAnswer[],
  ) => void;
}) {
  const stalePendingTool = isStalePendingTool(message, part, partIndex);
  if (isToolPartType(part.type))
    return (
      <ToolPart
        t={t}
        part={part}
        runEnded={messageRunEnded(message) || stalePendingTool}
        onSelectChat={onSelectChat}
        chatExists={chatExists}
        onAnswerQuestion={onAnswerQuestion}
      />
    );
  if (part.type === "reasoning" && part.text?.trim())
    return <AssistantReasoning t={t} text={part.text} />;
  if (part.type === "summary" && part.text?.trim())
    return <AssistantSummaryCard t={t} summary={part.text} />;
  if (part.type === "text" && part.text?.trim())
    return (
      <AssistantText
        t={t}
        text={part.text}
        sources={sources}
        onFork={onFork}
        message={message}
        chatMessages={chatMessages}
        hideActions={!messageRunEnded(message)}
      />
    );
  return null;
}

function isStalePendingTool(
  message: ChatMessage,
  part: ChatPart,
  partIndex: number,
) {
  if (!isToolPartType(part.type)) return false;
  if (part.state !== CHAT_PART_STATE.inputAvailable) return false;
  return (message.parts || []).slice(partIndex + 1).some(hasRenderedActivity);
}

function hasRenderedActivity(part: ChatPart) {
  if (
    part.type === "text" ||
    part.type === "reasoning" ||
    part.type === "summary"
  )
    return !!part.text?.trim();
  return isToolPartType(part.type);
}

function messageRunEnded(message: ChatMessage) {
  const metrics = message.metadata?.runMetrics as { endedAt?: unknown };
  return (
    !!metrics?.endedAt ||
    !!message.parts?.some((part) => part.state === CHAT_PART_STATE.outputError)
  );
}

function AssistantReasoning({ t, text }: { t: Messages; text: string }) {
  const { text: displayText } = useThrottledText(
    text,
    STREAM_RENDER_THROTTLE_MS,
  );
  const streaming = displayText.length < text.length;
  return (
    <Accordion type="single" collapsible className="assistant-reasoning">
      <AccordionItem value="reasoning">
        <AccordionTrigger className="assistant-reasoning-trigger">
          <span>
            <Brain size={14} />
            {t.sidepanel.runInfo.reasoning}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div
            className={`assistant-reasoning-body${streaming ? " streaming" : ""}`}
          >
            {displayText}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function AssistantText({
  t,
  text,
  modelLabel,
  createdAt,
  onFork,
  message,
  chatMessages = [],
  sources = [],
  showRunInfo = false,
  hideActions = false,
}: {
  t: Messages;
  text: string;
  modelLabel?: string;
  createdAt?: number;
  onFork?: () => void;
  message?: ChatMessage;
  chatMessages?: ChatMessage[];
  sources?: ChatSource[];
  showRunInfo?: boolean;
  hideActions?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const markdownRef = useRef<HTMLDivElement | null>(null);
  const runEnded = !hideActions;
  const { text: throttledText, animatedFrom } = useThrottledText(
    text,
    STREAM_RENDER_THROTTLE_MS,
  );
  const displayText = throttledText;
  const streaming = displayText.length < text.length;
  const outputSettled = runEnded && !streaming;
  const { html, codeBlocks } = useMemo(
    () =>
      renderMarkdown(displayText, t, copiedCodeId, sources, {
        animatedFromChar:
          displayText.length < text.length ? animatedFrom : undefined,
        mermaidPreview: outputSettled,
      }),
    [
      animatedFrom,
      copiedCodeId,
      displayText,
      outputSettled,
      sources,
      t,
      text.length,
    ],
  );
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
    const mermaidDownload = (event.target as HTMLElement | null)?.closest(
      "button[data-mermaid-download-url]",
    ) as HTMLButtonElement | null;
    if (mermaidDownload?.dataset.mermaidDownloadUrl) {
      event.preventDefault();
      event.stopPropagation();
      await downloadUrlAsFile(
        mermaidDownload.dataset.mermaidDownloadUrl,
        mermaidDownload.dataset.mermaidDownloadFilename ||
          "mermaid-diagram.svg",
      );
      return;
    }
    const button = (event.target as HTMLElement | null)?.closest(
      "button[data-code-index]",
    ) as HTMLButtonElement | null;
    if (!button) {
      const link = (event.target as HTMLElement | null)?.closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link?.href) return;
      event.preventDefault();
      event.stopPropagation();
      await openOrFocusUrl(link.href).catch(() => undefined);
      return;
    }
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

  function handleMarkdownImageError(
    event: React.SyntheticEvent<HTMLDivElement>,
  ) {
    const image =
      event.target instanceof HTMLImageElement ? event.target : null;
    const card = image?.closest(".markdown-image-card") as HTMLElement | null;
    if (!image || !card) return;
    card.classList.add("is-broken");
    card.dataset.alt = image.alt || "";
  }

  return (
    <div className={`assistant-text${streaming ? " streaming" : ""}`}>
      <div
        ref={markdownRef}
        className="markdown"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleMarkdownClick}
        onErrorCapture={handleMarkdownImageError}
      />
      {outputSettled && (
        <div className="assistant-actions">
          <div className="message-actions assistant-action-buttons">
            <IconTooltip label={copied ? t.common.copied : t.common.copy}>
              <Button
                variant="ghost"
                size="icon"
                className={`copy-message${copied ? " copied" : ""}`}
                aria-label={copied ? t.common.copied : t.common.copy}
                onClick={copyText}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </IconTooltip>
            {onFork && (
              <IconTooltip label={t.sidepanel.forkChat}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="copy-message"
                  aria-label={t.sidepanel.forkChat}
                  onClick={onFork}
                >
                  <GitBranch />
                </Button>
              </IconTooltip>
            )}
            {showRunInfo && message && (
              <MessageRunInfo
                t={t}
                message={message}
                chatMessages={chatMessages}
              />
            )}
          </div>
          {(modelLabel || createdAt) && (
            <span className="assistant-model-meta">
              {[modelLabel, createdAt ? formatMessageTime(createdAt) : ""]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

async function downloadUrlAsFile(url: string, filename: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("Unable to download file");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    await getBrowserApi().downloads.download({ url: objectUrl, filename });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
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
