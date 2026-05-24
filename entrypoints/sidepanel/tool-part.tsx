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
import type {
  QuestionToolAnswer,
  QuestionToolQuestion,
} from "../../src/shared/types";
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
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
  chatExists,
  onAnswerQuestion,
}: {
  t: Messages;
  part: ChatPart;
  runEnded?: boolean;
  onSelectChat?: (chatId: string) => void;
  chatExists: (chatId: string) => boolean;
  onAnswerQuestion?: (
    toolCallId: string,
    answers: QuestionToolAnswer[],
  ) => void;
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
  const localExecutionBridgeRunning =
    isLocalExecutionBridgeTool(name) && output.state === "running";
  const questionPending =
    name === BROWSER_TOOL_NAME.question && !runEnded && isQuestionPending(part);
  const loading =
    questionPending ||
    (!runEnded &&
      (subAgentRunning ||
        localExecutionBridgeRunning ||
        part.state === CHAT_PART_STATE.streaming ||
        part.state === CHAT_PART_STATE.inputStreaming ||
        part.state === CHAT_PART_STATE.inputAvailable));
  const isError = part.state === CHAT_PART_STATE.outputError;
  const isDone =
    part.state === CHAT_PART_STATE.outputAvailable ||
    part.state === CHAT_PART_STATE.done ||
    (runEnded && part.state === CHAT_PART_STATE.inputAvailable);
  const status = loading
    ? "loading"
    : isError
      ? "error"
      : isDone
        ? "done"
        : "idle";
  const subAgentChatId = subAgentChildChatId(name, part);
  const subAgentChatAvailable = subAgentChatId
    ? chatExists(subAgentChatId)
    : false;
  return (
    <div className={`tool-card ${status}`}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="tool-title tool-title-button">
            <span className="tool-icon">
              {toolIcon(name, (part.input || {}) as Record<string, unknown>)}
            </span>
            <strong className="tool-title-text">
              {loading ? <span className="shiny-text">{title}</span> : title}
            </strong>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="tool-json-popover" align="start">
          <pre className="ui-code-surface">{toolJsonDetail(name, part)}</pre>
        </PopoverContent>
      </Popover>
      <div className="tool-detail">
        <div className="tool-detail-content">
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
          {name === BROWSER_TOOL_NAME.question && (
            <QuestionToolForm
              t={t}
              part={part}
              active={questionPending}
              onSubmit={(answers) => onAnswerQuestion?.(part.id, answers)}
            />
          )}
          {description && name !== BROWSER_TOOL_NAME.question && (
            <div className="tool-description">{description}</div>
          )}
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
              disabled={!subAgentChatAvailable}
              onClick={() => {
                if (subAgentChatAvailable) onSelectChat?.(subAgentChatId);
              }}
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

function QuestionToolForm({
  t,
  part,
  active,
  onSubmit,
}: {
  t: Messages;
  part: ChatPart;
  active: boolean;
  onSubmit: (answers: QuestionToolAnswer[]) => void;
}) {
  const questions = questionToolQuestions(part.input);
  const submittedAnswers = questionToolSubmittedAnswers(part.output);
  const [selected, setSelected] = React.useState<Record<number, string[]>>({});
  const [customAnswers, setCustomAnswers] = React.useState<
    Record<number, string>
  >({});
  const questionGroupId = React.useId();
  const complete = questions.every((question, index) =>
    isQuestionAnswered(question, selected[index] || [], customAnswers[index]),
  );
  if (!questions.length) return null;
  if (submittedAnswers.length)
    return (
      <div className="tool-result-list tool-question-answers">
        {submittedAnswers.map((answer, index) => (
          <div className="tool-result-row" key={`${answer.question}-${index}`}>
            <span className="tool-result-label">{answer.question}</span>
            <span className="tool-result-value">
              {[...answer.answers, answer.customAnswer]
                .filter(Boolean)
                .join(", ") || t.sidepanel.questionNoAnswer}
            </span>
          </div>
        ))}
      </div>
    );
  return (
    <form
      className="tool-question-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (!active || !complete) return;
        onSubmit(
          questions.map((question, index) => ({
            question: question.question,
            answers: selected[index] || [],
            customAnswer: (customAnswers[index] || "").trim() || undefined,
          })),
        );
      }}
    >
      {questions.map((question, index) => {
        const allowCustom = question.custom !== false;
        const selectedValues = selected[index] || [];
        const titleId = `${questionGroupId}-${index}`;
        return (
          <Card
            className="tool-question-card"
            key={index}
            role="group"
            aria-labelledby={titleId}
          >
            <CardContent className="tool-question-card-content">
              <CardTitle className="tool-question-title" id={titleId}>
                {question.question}
              </CardTitle>
              {question.multiple ? (
                <ToggleGroup
                  type="multiple"
                  value={selectedValues}
                  disabled={!active}
                  onValueChange={(value) =>
                    setSelected((items) => ({ ...items, [index]: value }))
                  }
                >
                  {question.options.map((option) => (
                    <QuestionOptionItem key={option.label} option={option} />
                  ))}
                </ToggleGroup>
              ) : (
                <ToggleGroup
                  type="single"
                  value={selectedValues[0] || ""}
                  disabled={!active}
                  onValueChange={(value) =>
                    setSelected((items) => ({
                      ...items,
                      [index]: value ? [value] : [],
                    }))
                  }
                >
                  {question.options.map((option) => (
                    <QuestionOptionItem key={option.label} option={option} />
                  ))}
                </ToggleGroup>
              )}
              {allowCustom &&
                (question.multiple ? (
                  <Textarea
                    value={customAnswers[index] || ""}
                    disabled={!active}
                    rows={2}
                    placeholder={t.sidepanel.questionCustomPlaceholder}
                    onChange={(event) =>
                      setCustomAnswers((items) => ({
                        ...items,
                        [index]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    value={customAnswers[index] || ""}
                    disabled={!active}
                    placeholder={t.sidepanel.questionCustomPlaceholder}
                    onChange={(event) =>
                      setCustomAnswers((items) => ({
                        ...items,
                        [index]: event.target.value,
                      }))
                    }
                  />
                ))}
            </CardContent>
          </Card>
        );
      })}
      <Button type="submit" size="sm" disabled={!active || !complete}>
        {t.sidepanel.questionSubmit}
      </Button>
    </form>
  );
}

function isQuestionAnswered(
  question: QuestionToolQuestion,
  selected: string[],
  customAnswer = "",
) {
  return (
    selected.length > 0 || (question.custom !== false && !!customAnswer.trim())
  );
}

function isQuestionPending(part: ChatPart) {
  if (questionToolSubmittedAnswers(part.output).length) return false;
  return (
    part.state === CHAT_PART_STATE.inputAvailable ||
    part.state === CHAT_PART_STATE.outputAvailable
  );
}

function QuestionOptionItem({
  option,
}: {
  option: { label: string; description?: string };
}) {
  return (
    <ToggleGroupItem value={option.label} className="tool-question-option">
      <span>{option.label}</span>
      {option.description && <small>{option.description}</small>}
    </ToggleGroupItem>
  );
}

function questionToolQuestions(input: unknown): QuestionToolQuestion[] {
  const questions = (input as { questions?: unknown } | undefined)?.questions;
  if (!Array.isArray(questions)) return [];
  return questions.slice(0, 6).flatMap((question) => {
    if (!question || typeof question !== "object") return [];
    const item = question as Record<string, unknown>;
    const text = String(item.question || "").trim();
    const options = Array.isArray(item.options)
      ? item.options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const optionRecord = option as Record<string, unknown>;
          const label = String(optionRecord.label || "").trim();
          if (!label) return [];
          return [
            {
              label,
              description: String(optionRecord.description || "").trim(),
            },
          ];
        })
      : [];
    if (!text || !options.length) return [];
    return [
      {
        question: text,
        options,
        multiple: item.multiple === true,
        custom: item.custom !== false,
      },
    ];
  });
}

function questionToolSubmittedAnswers(output: unknown): QuestionToolAnswer[] {
  const answers = (output as { answers?: unknown } | undefined)?.answers;
  if (!Array.isArray(answers)) return [];
  return answers.flatMap((answer) => {
    if (!answer || typeof answer !== "object") return [];
    const item = answer as Record<string, unknown>;
    const question = String(item.question || "").trim();
    return [
      {
        question,
        answers: Array.isArray(item.answers)
          ? item.answers.map((value) => String(value).trim()).filter(Boolean)
          : [],
        customAnswer: String(item.customAnswer || "").trim() || undefined,
      },
    ];
  });
}

function isSubAgentTool(name: string) {
  return (
    name === BROWSER_TOOL_NAME.startSubAgent ||
    name === BROWSER_TOOL_NAME.getSubAgentStatus
  );
}

function isLocalExecutionBridgeTool(name: string) {
  return (
    name === BROWSER_TOOL_NAME.startLocalExecutionBridge ||
    name === BROWSER_TOOL_NAME.getLocalExecutionBridgeStatus ||
    name === BROWSER_TOOL_NAME.cancelLocalExecutionBridge
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
