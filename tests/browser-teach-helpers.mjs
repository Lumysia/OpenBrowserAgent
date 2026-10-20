import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { poll } from "./chromium.mjs";

// Teach mode in browser tests: messages to the background as the side
// panel sends them, the recordings it keeps, and whether a tab's recorder
// is listening.

export const teach = (panel, message) =>
  panel.call((message) => chrome.runtime.sendMessage(message), message);

export const teachSessions = (panel) =>
  panel.call(
    async (key) => (await chrome.storage.session.get(key))[key] || {},
    STORAGE_KEYS.teachSessions,
  );

// The recording `tabId` belongs to.
export const teachSession = async (panel, tabId) =>
  Object.values(await teachSessions(panel)).find((session) =>
    session.tabIds.includes(tabId),
  );

// The id of the tab whose URL ends with `suffix`.
export const tabIdOf = (panel, suffix) =>
  poll(() =>
    panel.call(
      async (suffix) =>
        (await chrome.tabs.query({})).find((tab) => tab.url.endsWith(suffix))
          ?.id,
      suffix,
    ),
  );

// Whether the recorder runs in the tab's current document (it lives in the
// extension's isolated world, where the page cannot see it).
export const recorderActive = (panel, tabId) =>
  panel.call(
    async (tabId) =>
      (
        await chrome.scripting
          .executeScript({
            target: { tabId, frameIds: [0] },
            func: () => !!globalThis.__obaTeachRecorderActive,
          })
          .catch(() => [])
      )[0]?.result === true,
    tabId,
  );

export const waitForRecorder = (panel, tabId) =>
  poll(() => recorderActive(panel, tabId));
