import { getBrowserApi } from "../../shared/browser-api";
import { delay } from "../../shared/cancellation";
import type { TaskTrigger } from "../../shared/tasks/types";
import { adoptAgentTab } from "../agent-tabs";
import { callPage } from "../page-agent";
import { waitTabComplete } from "../tools/tabs";

type WatchTrigger = Extract<TaskTrigger, { kind: "watch" }>;

// Pages that fill in their content with script may still be empty when the
// load completes: read again a few times before taking empty for an answer.
const EMPTY_RETRIES = 3;
const EMPTY_RETRY_MS = 1_000;

// The tabs of a task's runs are grouped by the task, as a chat's are.
export function taskTabOwner(taskId: string) {
  return { chatId: `task:${taskId}` };
}

// Opens the watched page in a background tab of the agent's tab group. It
// never takes focus and never touches the user's tabs.
export async function openTaskTab(taskId: string, url: string) {
  const api = getBrowserApi();
  const tab = await api.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error("Could not open the page.");
  await adoptAgentTab(taskTabOwner(taskId), tab).catch(() => undefined);
  await waitTabComplete(tab.id);
  return tab.id;
}

// The browser is offline, or the tab's page did not load at all (its main
// frame shows the browser's error page): a run that needs the page is
// skipped, not failed.
export async function pageUnreachable(tabId?: number) {
  if (globalThis.navigator?.onLine === false) return true;
  const navigation = getBrowserApi().webNavigation;
  if (tabId === undefined || !navigation?.getFrame) return false;
  const frame = await Promise.resolve()
    .then(() => navigation.getFrame({ tabId, frameId: 0 }))
    .catch(() => undefined);
  return frame?.errorOccurred === true;
}

export async function closeTaskTab(tabId: number | undefined) {
  if (tabId === undefined) return;
  await getBrowserApi()
    .tabs.remove(tabId)
    .catch(() => undefined);
}

// The watched text of the page in `tabId`: the selected part, else the main
// content. Throws when the part is not on the page.
export async function readWatchedText(tabId: number, trigger: WatchTrigger) {
  for (let attempt = 1; ; attempt++) {
    const { value } = await callPage<{ text: string | null }>(
      tabId,
      "watchedText",
      { selector: trigger.selector || "" },
    );
    if (value.text === null && attempt >= EMPTY_RETRIES)
      throw new Error(
        `The watched part of the page (${trigger.selector}) is not on ${trigger.url}.`,
      );
    if (value.text?.trim() || attempt >= EMPTY_RETRIES) return value.text || "";
    await delay(EMPTY_RETRY_MS);
  }
}
