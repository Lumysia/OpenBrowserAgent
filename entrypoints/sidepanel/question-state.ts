import {
  CHAT_PART_STATE,
  type ChatPart,
  type QuestionToolAnswer,
  type QuestionToolQuestion,
} from "../../src/shared/types";

// Whether the run waits on an ask call: only while its tool runs (the call
// is being written or waits for the answer) in a run that has not ended.
// Once the tool returned, failed or the run ended, nothing waits on it.
export function isQuestionPending(part: ChatPart, runEnded: boolean) {
  if (runEnded || questionToolSubmittedAnswers(part.output).length)
    return false;
  return (
    part.state === CHAT_PART_STATE.inputStreaming ||
    part.state === CHAT_PART_STATE.inputAvailable
  );
}

export function questionToolQuestions(input: unknown): QuestionToolQuestion[] {
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
        ...(typeof item.confirmSubmit === "string" && item.confirmSubmit
          ? { confirmSubmit: item.confirmSubmit }
          : {}),
      },
    ];
  });
}

export function questionToolSubmittedAnswers(
  output: unknown,
): QuestionToolAnswer[] {
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
