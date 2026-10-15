import React from "react";
import {
  CHAT_PART_STATE,
  type ChatPart,
  type QuestionToolAnswer,
  type QuestionToolQuestion,
} from "../../src/shared/types";
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  Input,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  UserText,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

// The ask tool's card: the model's questions as a form while the run waits
// for the answers, then the answers given.
export function QuestionToolForm({
  part,
  active,
  onSubmit,
}: {
  part: ChatPart;
  active: boolean;
  onSubmit: (answers: QuestionToolAnswer[]) => void;
}) {
  const t = useMessages();
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
      <div className="tool-result-list tool-question-answers ui-selectable">
        {submittedAnswers.map((answer, index) => (
          <div className="tool-result-row" key={`${answer.question}-${index}`}>
            <span className="tool-result-label">{answer.question}</span>
            <UserText
              className="tool-result-value"
              text={
                [...answer.answers, answer.customAnswer]
                  .filter(Boolean)
                  .join(", ") || t.sidepanel.questionNoAnswer
              }
            />
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

export function isQuestionPending(part: ChatPart) {
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
