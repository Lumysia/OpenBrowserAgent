import { sessionOfTab, teachSessions } from "../../shared/teach/records";
import { TEACH_STATE } from "../../shared/teach/types";
import { USER_ERROR_CODE, UserError } from "../../shared/user-errors";

// The agent does not work in a tab while the user records it: a run does
// not start there, page tools refuse it (see run-chat.ts, run-tab.ts), and
// tools that take tab ids directly (closing, grouping) refuse it too.
export async function refuseRecordingTabs(
  tabIds: Iterable<number | undefined>,
) {
  const sessions = await teachSessions.get();
  for (const tabId of tabIds)
    if (sessionOfTab(sessions, tabId)?.state === TEACH_STATE.recording)
      throw new UserError(
        USER_ERROR_CODE.tabRecording,
        `Tab ${tabId} is being recorded to teach a skill. The agent can't work in it until the user stops the recording.`,
      );
}

export function refuseRecordingTab(tabId: number | undefined) {
  return refuseRecordingTabs([tabId]);
}

// The tabs among `tabIds` that are not being recorded.
export async function notRecording(tabIds: number[]) {
  const sessions = await teachSessions.get();
  return tabIds.filter(
    (tabId) => sessionOfTab(sessions, tabId)?.state !== TEACH_STATE.recording,
  );
}
