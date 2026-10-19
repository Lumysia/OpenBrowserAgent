import { languageName } from "../language-name";
import { TOOL_NAME } from "../tool-names";
import type { ChatMessage } from "../types";

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
    `Before a final submit, purchase, send or delete, stop and ask the user to confirm (${TOOL_NAME.ask}). If they do not, stop there.`,
    `Use the skill's "Check it worked" section. Then call ${TOOL_NAME.skillCheck} once with how it went, and tell the user briefly.`,
    `Reply in ${languageName(replyLanguage)}.`,
  ].join("\n");
}
