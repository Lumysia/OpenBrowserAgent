import { languageName } from "../language-name";
import { TOOL_NAME } from "../tool-names";
import type { Messages } from "../i18n";
import type { ChatMessage, QuestionToolQuestion } from "../types";

// The check run of a recorded skill: the side panel sends it as a request
// with the skill picked, in a tab of its own, and the background gives the
// run the skillCheck tool (see background/tools/skill-check.ts).

export type SkillCheckMetadata = { skillId: string };

export function skillCheckOf(
  message: ChatMessage | undefined,
): SkillCheckMetadata | undefined {
  const value = message?.metadata?.skillCheck as
    Partial<SkillCheckMetadata> | undefined;
  return typeof value?.skillId === "string" && value.skillId
    ? { skillId: value.skillId }
    : undefined;
}

export function skillCheckInstruction({
  name,
  tabId,
  replyLanguage,
}: {
  name: string;
  tabId: number;
  replyLanguage: string;
}) {
  return [
    `Check the recorded skill "${name}" (its instructions are below): do the task once in tab ${tabId}, following its steps as written, to see that they work.`,
    `First ask the user (${TOOL_NAME.ask}) for the inputs the skill needs, in one question. Never ask for the value of a sensitive input (a password, code or card number): when you reach that field, ask the user to fill it on the page themselves or let the browser fill it, and go on when they say it is done.`,
    `Before a final submit, purchase, send or delete, stop and ask the user to confirm (${TOOL_NAME.ask}). If they do not, stop there. ${TOOL_NAME.act} refuses a step that submits a form until the user chose to submit in an ${TOOL_NAME.ask} question with confirmSubmit set to the ref it names.`,
    `Use the skill's "Check it worked" section. Then call ${TOOL_NAME.skillCheck} once with how it went, and tell the user briefly.`,
    `Reply in ${languageName(replyLanguage)}.`,
  ].join("\n");
}

// An ask question that confirms a submit in a check run: whatever options
// the model gave, the user chooses between the product's own Submit (the
// first, which allows the submit) and Don't submit, so "confirmed" does not
// depend on the model's words.
export function withConfirmSubmitOptions(
  question: QuestionToolQuestion,
  t: Pick<Messages, "teach">,
): QuestionToolQuestion {
  if (!question.confirmSubmit) return question;
  return {
    ...question,
    options: [
      { label: t.teach.check.submit, description: "" },
      { label: t.teach.check.dontSubmit, description: "" },
    ],
    multiple: false,
    custom: false,
  };
}

export function confirmsSubmit(answers: string[], t: Pick<Messages, "teach">) {
  return answers.length === 1 && answers[0] === t.teach.check.submit;
}
