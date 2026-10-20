import { getMessages, type Messages } from "../../shared/i18n";
import { storage } from "../../shared/storage";
import {
  confirmsSubmit,
  withConfirmSubmitOptions,
} from "../../shared/teach/check";
import { TOOL_NAME } from "../../shared/tool-names";
import type {
  QuestionToolAnswer,
  QuestionToolQuestion,
} from "../../shared/types";
import { waitForAnswer } from "../stream-sessions";
import {
  fail,
  ok,
  schema,
  type RunContext,
  type ToolDefinition,
} from "./types";

export const askTool: ToolDefinition = {
  name: TOOL_NAME.ask,
  effects: "read",
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
            confirmSubmit: {
              type: "string",
              description:
                "Check runs only: the ref act named when it refused a step that submits a form. The user then chooses between Submit and Don't submit (your options are replaced).",
            },
          },
          ["question", "options"],
        ),
      },
    },
    ["questions"],
  ),
  async execute(input, { run, toolCallId, signal }) {
    const t = getMessages(await storage.language.get());
    const questions = normalizeQuestions(input.questions).map((question) =>
      withConfirmSubmitOptions(question, t),
    );
    if (!questions.length)
      return fail("Give 1-6 questions, each with at least one option.");
    // Nobody is there to answer: the task waits for the user instead.
    if (run.unattended) {
      run.unattended.needsUser(
        questions.map((item) => item.question).join(" "),
      );
      return ok(
        "Nobody can answer now: this run works on its own. The user will be told that the task needs them. Stop here and, in your final reply, say what you need from them and why.",
        { answers: [], unattended: true },
      );
    }
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
    const allowed = confirmedSubmits(run, questions, answers, t);
    return ok(
      [
        ...answers.map((answer) => {
          const chosen = [...answer.answers, answer.customAnswer]
            .filter(Boolean)
            .join(", ");
          return `- ${answer.question}: ${chosen || "No answer"}`;
        }),
        ...allowed.map(
          (ref) =>
            `The user allowed one submit through ${ref}: repeat that step now.`,
        ),
      ].join("\n"),
      { answers },
    );
  },
};

// The refs a check run's user allowed to submit through (check-submit.ts).
function confirmedSubmits(
  run: RunContext,
  questions: QuestionToolQuestion[],
  answers: QuestionToolAnswer[],
  t: Messages,
) {
  if (!run.skillCheck) return [];
  return questions.flatMap((question, index) => {
    const answer =
      answers.find((item) => item.question === question.question) ||
      answers[index];
    if (!question.confirmSubmit || !answer) return [];
    if (!confirmsSubmit(answer.answers, t) || answer.customAnswer) return [];
    run.skillCheck!.confirmedSubmits.add(question.confirmSubmit);
    return [question.confirmSubmit];
  });
}

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
    const confirmSubmit =
      typeof raw.confirmSubmit === "string" ? raw.confirmSubmit.trim() : "";
    return [
      {
        question,
        options,
        multiple: raw.multiple === true,
        custom: raw.custom !== false,
        ...(confirmSubmit ? { confirmSubmit } : {}),
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
