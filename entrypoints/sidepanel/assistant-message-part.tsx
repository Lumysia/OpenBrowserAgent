import { Brain, Check, Copy, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import {
  COPY_FEEDBACK_MS,
  STREAM_RENDER_THROTTLE_MS,
} from "../../src/shared/config";
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
import { cn } from "../../src/ui/utils";
import { useMessages } from "../../src/ui/messages";

export const NO_SOURCES: ChatSource[] = [];

// A compaction summary, or a compaction that failed.
function AssistantSummaryCard({ part }: { part: ChatPart }) {
  const t = useMessages();
  const failed = !!part.error;
  return (
    <div
      className={cn(
        "tool-card",
        failed ? "error" : "done",
        "context-summary-card",
      )}
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
          <pre className="context-summary-text ui-selectable">
            {(part.error || part.text || "").trim()}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function AssistantPart({
  part,
  partIndex,
  sources,
  onFork,
  message,
  chatMessages,
  onSelectChat,
  chatExists,
  onAnswerQuestion,
  runEnded,
}: {
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
  runEnded: boolean;
}) {
  const t = useMessages();
  const stalePendingTool = isStalePendingTool(message, part, partIndex);
  if (isToolPartType(part.type))
    return (
      <ToolPart
        part={part}
        runEnded={runEnded || stalePendingTool}
        onSelectChat={onSelectChat}
        chatExists={chatExists}
        onAnswerQuestion={onAnswerQuestion}
      />
    );
  if (part.type === "reasoning" && part.text?.trim())
    return <AssistantReasoning text={part.text} />;
  if (part.type === "summary" && (part.text?.trim() || part.error))
    return <AssistantSummaryCard part={part} />;
  if (part.type === "text" && part.text?.trim())
    return (
      <AssistantText
        text={part.text}
        sources={sources}
        onFork={onFork}
        message={message}
        chatMessages={chatMessages}
        hideActions={!runEnded}
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

function AssistantReasoning({ text }: { text: string }) {
  const t = useMessages();
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
            className={cn(
              "assistant-reasoning-body ui-selectable",
              streaming && "streaming",
            )}
          >
            {displayText}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function AssistantText({
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
  const t = useMessages();
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
    <div className={cn("assistant-text", streaming && "streaming")}>
      <MarkdownContent
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
                className={cn("copy-message", copied && "copied")}
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
              <MessageRunInfo message={message} chatMessages={chatMessages} />
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
