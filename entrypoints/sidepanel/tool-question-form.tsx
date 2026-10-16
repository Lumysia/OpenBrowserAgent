import { Check } from "lucide-react";
import React from "react";
import type {
  ChatPart,
  QuestionToolAnswer,
  QuestionToolQuestion,
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
import {
  questionToolQuestions,
  questionToolSubmittedAnswers,
} from "./question-state";

// The ask tool's card: the model's questions as a form while the run waits
// for the answers, then the answers given (none, when nothing waits any
// more).
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
  if (!active) {
    const rows = submittedAnswers.length
      ? submittedAnswers
      : questions.map((question) => ({
          question: question.question,
          answers: [],
          customAnswer: undefined,
        }));
    return (
      <div className="tool-result-list tool-question-answers ui-selectable">
        {rows.map((answer, index) => (
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
  }
  return (
    <form
      className="tool-question-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (!complete) return;
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
                  layout="grid"
                  value={selectedValues}
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
                  layout="grid"
                  value={selectedValues[0] || ""}
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
      <Button type="submit" size="sm" disabled={!complete}>
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

function QuestionOptionItem({
  option,
}: {
  option: { label: string; description?: string };
}) {
  return (
    <ToggleGroupItem value={option.label} className="tool-question-option">
      <span className="tool-question-option-text">
        <span className="tool-question-option-label">{option.label}</span>
        {option.description && <small>{option.description}</small>}
      </span>
      <Check className="tool-question-option-check" size={16} aria-hidden />
    </ToggleGroupItem>
  );
}
