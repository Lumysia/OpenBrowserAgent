import {
  SKILL_FROM_DEMONSTRATION_PATH,
  skillCreator,
} from "../../shared/builtin-skill-texts/skill-creator";
import { errorMessage } from "../../shared/error-message";
import { teachSessions } from "../../shared/teach/records";
import { parseDraft } from "../../shared/teach/skill-files";
import { buildTranscript } from "../../shared/teach/transcript";
import { TEACH_STATE, type TeachSession } from "../../shared/teach/types";
import { resolveModel } from "../model-resolver";
import { requestText } from "../pi-provider";
import { updateSession } from "./recorder";

// Turns a stopped recording into a draft skill with one request to the
// chat model: the skill-creator's instructions for skills from a
// demonstration, and the transcript (which has no typed values). The draft
// waits in the session for the user to review and save it.

const SYSTEM = `${skillCreator.body}

${skillCreator.references[SKILL_FROM_DEMONSTRATION_PATH]}`;

export function draftPrompt(session: TeachSession) {
  return `Write the skill for this recording.

${buildTranscript(session)}`;
}

export async function writeDraft(tabId: number) {
  const session = Object.values(await teachSessions.get()).find(
    (item) => item.tabId === tabId,
  );
  if (!session || session.state !== TEACH_STATE.writing) return;
  try {
    if (!session.steps.length) throw new Error("Nothing was recorded.");
    const model = await resolveModel();
    const { text } = await requestText(model, {
      system: SYSTEM,
      prompt: draftPrompt(session),
    });
    const draft = parseDraft(text);
    if (!draft.body) throw new Error("The model wrote no instructions.");
    await updateSession(tabId, (current) =>
      current.id === session.id
        ? { ...current, state: TEACH_STATE.review, draft, error: undefined }
        : current,
    );
  } catch (error) {
    await updateSession(tabId, (current) =>
      current.id === session.id
        ? { ...current, state: TEACH_STATE.failed, error: errorMessage(error) }
        : current,
    );
  }
}
