import { getActiveTab } from "../shared/browser";
import { selectedTextsFromMetadata } from "../shared/selected-text";
import { getBrowserApi } from "../shared/browser-api";
import { sessionRecord } from "../shared/session-record";
import { STORAGE_KEYS } from "../shared/storage-keys";
import type { AttachmentTab, ChatMessage } from "../shared/types";
import { xmlTag } from "../shared/xml";

// The tab a run works on. Page tools that name no tab use the run's tab,
// never whatever tab is active when the call runs: the user may switch tabs
// while the agent works. It starts as the tab the user sent the message
// from and follows the agent: a tab it names, opens, navigates or switches
// to becomes the run's tab. A closed run tab is an error, not a fallback.
// The last one per chat lives in session storage, for the next message.

const REMEMBERED_CHATS = 100;

// The last run tab by chat, the most recent last.
const runTabs = sessionRecord<Record<string, number>>(
  STORAGE_KEYS.runTabs,
  () => ({}),
);

export type RunTab = {
  // The run's tab, if it has one.
  readonly id: number | undefined;
  // The tab a call works on: the one it names (which becomes the run's
  // tab), else the run's tab.
  target(tabId: unknown): Promise<chrome.tabs.Tab & { id: number }>;
  // Makes a tab the run's tab.
  use(tab: Pick<chrome.tabs.Tab, "id" | "title">): void;
};

// Describes the `tabId` parameter of page tools.
export const RUN_TAB_ID_PARAM = {
  type: "number",
  description:
    "Defaults to the tab you are working on (see working_tab), not the tab the user has open now.",
};

function tabIdArg(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

async function getTab(id: number) {
  const tab = await Promise.resolve()
    .then(() => getBrowserApi().tabs.get(id))
    .catch(() => undefined);
  return tab ? { ...tab, id } : undefined;
}

function remember(chatId: string, tabId: number) {
  if (!chatId) return;
  runTabs
    .update((stored) => {
      const record = { ...stored };
      delete record[chatId];
      record[chatId] = tabId;
      return Object.fromEntries(
        Object.entries(record).slice(-REMEMBERED_CHATS),
      );
    })
    .catch(() => undefined);
}

async function rememberedTab(chatId: string) {
  return tabIdArg((await runTabs.get())[chatId]);
}

export function createRunTab(
  chatId: string,
  start?: Pick<chrome.tabs.Tab, "id" | "title">,
): RunTab {
  let current = start?.id === undefined ? undefined : { ...start };
  const runTab: RunTab = {
    get id() {
      return current?.id;
    },
    use(tab) {
      if (tab.id === undefined) return;
      const changed = tab.id !== current?.id;
      current = { id: tab.id, title: tab.title };
      if (changed) remember(chatId, tab.id);
    },
    async target(value) {
      const named = tabIdArg(value);
      if (named) {
        const tab = await getTab(named);
        if (!tab)
          throw new Error(
            `Tab ${named} does not exist. Use tabs (action list) to see open tabs.`,
          );
        runTab.use(tab);
        return tab;
      }
      if (current?.id === undefined)
        throw new Error(
          "There is no tab to work on. Use tabs (action list) and pass a tabId, or open a page with tabs.",
        );
      const tab = await getTab(current.id);
      if (!tab)
        throw new Error(
          `The tab you were working on (tab ${current.id}${current.title ? `: ${current.title}` : ""}) was closed. Use tabs (action list) and pass a tabId, or open the page again with tabs.`,
        );
      current.title = tab.title;
      return tab;
    },
  };
  return runTab;
}

// The tabs a message was sent with: the side panel's attached tabs (the
// page the user is on, or a smart bar or context menu request's page), then
// the pages of selected text.
function messageTabIds(message: ChatMessage | undefined) {
  const attached = Array.isArray(message?.metadata?.attachedTabs)
    ? (message.metadata.attachedTabs as AttachmentTab[])
    : [];
  return [
    ...attached.map((tab) => tab?.id),
    ...selectedTextsFromMetadata(message?.metadata).map((text) => text.tabId),
  ];
}

// The run's first tab: the one a parent run hands to its sub-agent, the
// one the message was sent with, the chat's last tab, or the tab active
// now. Also returns the chat's last tab when it is another open tab.
export async function startRunTab(
  chatId: string,
  latest: ChatMessage | undefined,
  handed?: number,
) {
  const remembered = await rememberedTab(chatId);
  let start: (chrome.tabs.Tab & { id: number }) | undefined;
  for (const value of [handed, ...messageTabIds(latest), remembered]) {
    const id = tabIdArg(value);
    start = id === undefined ? undefined : await getTab(id);
    if (start) break;
  }
  if (!start) {
    const active = await getActiveTab();
    if (active?.id !== undefined)
      start = active as chrome.tabs.Tab & { id: number };
  }
  const earlier =
    remembered !== undefined && remembered !== start?.id
      ? await getTab(remembered)
      : undefined;
  const tab = createRunTab(chatId, start);
  if (start) tab.use(start);
  return { tab, start, earlier };
}

function tabText(tab: chrome.tabs.Tab) {
  return `tab ${tab.id} (${tab.title || "untitled"} | ${tab.url || ""})`;
}

// Tells the model which tab its page tools use when a call names none.
export function workingTabNote(
  start: chrome.tabs.Tab | undefined,
  earlier: chrome.tabs.Tab | undefined,
) {
  const lines = [
    start
      ? `Tools without a tabId work on ${tabText(start)}.`
      : "No tab is selected: pass a tabId, or open a page with tabs.",
    earlier
      ? `Earlier in this chat you worked on ${tabText(earlier)}; pass its tabId to continue there.`
      : "",
  ].filter(Boolean);
  return xmlTag("working_tab", lines.join(" "));
}

// The messages with the working tab added to the context of the latest
// message, when it is the user's (only for this run; nothing is stored).
export function withWorkingTab(messages: ChatMessage[], note: string) {
  const index = messages.length - 1;
  const message = messages[index];
  if (message?.role !== "user") return messages;
  const context =
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "";
  const next = [...messages];
  next[index] = {
    ...message,
    metadata: {
      ...message.metadata,
      context: [context, note].filter(Boolean).join("\n\n"),
    },
  };
  return next;
}
