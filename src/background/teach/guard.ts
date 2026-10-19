import { sessionOfTab, teachSessions } from "../../shared/teach/records";
import { TEACH_STATE } from "../../shared/teach/types";
import { USER_ERROR_CODE, UserError } from "../../shared/user-errors";

// The agent does not work in a tab while the user records it: a run does
// not start there, and page tools refuse it (see run-chat.ts, run-tab.ts).
export async function refuseRecordingTab(tabId: number | undefined) {
  if (tabId === undefined) return;
  const session = sessionOfTab(await teachSessions.get(), tabId);
  if (session?.state === TEACH_STATE.recording)
    throw new UserError(
      USER_ERROR_CODE.tabRecording,
      `Tab ${tabId} is being recorded to teach a skill. The agent can't work in it until the user stops the recording.`,
    );
}
