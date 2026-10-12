import { Brain, Check, Copy, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import {
  COPY_FEEDBACK_MS,
  STREAM_RENDER_THROTTLE_MS,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
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
  IconTooltip,
} from "../../src/ui/components";
import { formatMessageTime } from "./format";
import { MarkdownContent } from "./markdown-content";
import { MessageRunInfo } from "./message-run-info";
import { ToolPart } from "./tool-part";
import { useThrottledText } from "./use-throttled-text";

export const NO_SOURCES: ChatSource[] = [];

// A compaction summary, or a compaction that failed.
function AssistantSummaryCard({ t, part }: { t: Messages; part: ChatPart }) {
  const failed = !!part.error;
  return (
    <div
      className={`tool-card ${failed ? "error" : "done"} context-summary-card`}
    >
      <div className="tool-title">
        <span className="tool-icon">
          <Brain />
        </span>
        <strong className="tool-title-text">
          {failed
            ? t.sidepanel.contextSummaryFailedTitle
            : t.sidepanel.contextSummaryTitle}
        </strong>
      </div>
      <div className="tool-detail">
        <div className="tool-detail-content">
          <div className="tool-description context-summary-description">
            {failed
              ? t.sidepanel.contextSummaryFailedDescription
              : t.sidepanel.contextSummaryDescription}
          </div>
          <pre className="context-summary-text">
            {(part.error || part.text || "").trim()}
          </pre>
        </div>
      </div>
    </div>
  );
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
  if (part.type === "summary" && (part.text?.trim() || part.error))
    return <AssistantSummaryCard t={t} part={part} />;
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
    return !!part.text?.trim() || !!part.error;
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
  sources = NO_SOURCES,
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
  const runEnded = !hideActions;
  const { text: displayText, animatedFrom } = useThrottledText(
    text,
    STREAM_RENDER_THROTTLE_MS,
  );
  const streaming = displayText.length < text.length;
  const outputSettled = runEnded && !streaming;
  useEffect(() => {
    if (!copied) return undefined;
    const timeout = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  function copyText() {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }

  return (
    <div className={`assistant-text${streaming ? " streaming" : ""}`}>
      <MarkdownContent
        t={t}
        text={displayText}
        sources={sources}
        streaming={streaming}
        settled={outputSettled}
        animatedFrom={animatedFrom}
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
