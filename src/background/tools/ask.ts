import { TOOL_NAME } from "../../shared/tool-names";
import type {
  QuestionToolAnswer,
  QuestionToolQuestion,
} from "../../shared/types";
import { waitForAnswer } from "../stream-sessions";
import { fail, ok, schema, type ToolDefinition } from "./types";

export const askTool: ToolDefinition = {
  name: TOOL_NAME.ask,
  summary: "Ask the user",
  description:
    "Ask the user 1-6 questions with choices, before doing the work, when a missing detail would change what you do or recommend. Offer the likely answers as options. Not for minor preferences: pick a default and say so.",
  parameters: schema(
    {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: schema(
          {
            question: { type: "string" },
            options: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: schema(
                {
                  label: { type: "string" },
                  description: { type: "string" },
                },
                ["label"],
              ),
            },
            multiple: { type: "boolean" },
            custom: {
              type: "boolean",
              description: "Allow a typed answer. Defaults to true.",
            },
          },
          ["question", "options"],
        ),
      },
    },
    ["questions"],
  ),
  async execute(input, { run, toolCallId, signal }) {
    const questions = normalizeQuestions(input.questions);
    if (!questions.length)
      return fail("Give 1-6 questions, each with at least one option.");
    const answers = await waitForAnswer(
      run.session,
      toolCallId,
      (raw) => {
        const answers = normalizeAnswers(raw);
        return answers.length ? answers : undefined;
      },
      signal,
    );
    if (!answers)
      return ok(
        "The user did not answer. They wrote a message instead; it follows.",
        { answers: [] },
      );
    return ok(
      answers
        .map((answer) => {
          const chosen = [...answer.answers, answer.customAnswer]
            .filter(Boolean)
            .join(", ");
          return `- ${answer.question}: ${chosen || "No answer"}`;
        })
        .join("\n"),
      { answers },
    );
  },
};

function normalizeQuestions(value: unknown): QuestionToolQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const question = String(raw.question || "").trim();
    const options = Array.isArray(raw.options)
      ? raw.options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const record = option as Record<string, unknown>;
          const label = String(record.label || "").trim();
          return label
            ? [{ label, description: String(record.description || "").trim() }]
            : [];
        })
      : [];
    if (!question || !options.length) return [];
    return [
      {
        question,
        options,
        multiple: raw.multiple === true,
        custom: raw.custom !== false,
      },
    ];
  });
}

function normalizeAnswers(value: unknown): QuestionToolAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    return [
      {
        question: String(raw.question || "").trim(),
        answers: Array.isArray(raw.answers)
          ? raw.answers.map((answer) => String(answer).trim()).filter(Boolean)
          : [],
        customAnswer: String(raw.customAnswer || "").trim(),
      },
    ];
  });
}
