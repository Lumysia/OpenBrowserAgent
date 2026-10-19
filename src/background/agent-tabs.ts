import { getBrowserApi } from "../shared/browser-api";
import { PRODUCT_NAME } from "../shared/config";
import { sessionRecord } from "../shared/session-record";
import { storage } from "../shared/storage";
import { STORAGE_KEYS } from "../shared/storage-keys";
import { ownerChat, type RunContext } from "./tools/types";

// Tabs the agent opens stay in one tab group per chat, so they never mix
// with the user's own tabs, and `tabs list` can tell them apart. A group
// cannot span windows: a chat gets one group in each window it opens tabs
// in. The record lives in session storage and ends with the browser session.

const GROUP_TITLE_MAX_CHARS = 30;

type ChatTabs = {
  tabs: number[];
  groups: number[];
  // The title last given to the groups; a different one is the user's.
  title?: string;
};

// By the chat that owns the tabs. Updates run one at a time: parallel runs
// must not lose tabs.
const agentTabs = sessionRecord<Record<string, ChatTabs>>(
  STORAGE_KEYS.agentTabs,
  () => ({}),
);

export async function agentTabIds(
  run: Pick<RunContext, "chatId" | "parentChatId">,
) {
  return new Set((await agentTabs.get())[ownerChat(run)]?.tabs || []);
}

// Opens a tab for the agent and puts it in the chat's group.
export async function openAgentTab(
  run: Pick<RunContext, "chatId" | "parentChatId">,
  properties: chrome.tabs.CreateProperties,
) {
  const tab = await getBrowserApi().tabs.create(properties);
  return { tab, group: await adoptAgentTab(run, tab) };
}

// Records a tab the agent opened and puts it in the chat's group of its
// window. Returns the group's title, or nothing when the browser has no tab
// groups or the tab cannot be grouped (such as in a popup window).
export async function adoptAgentTab(
  run: Pick<RunContext, "chatId" | "parentChatId">,
  tab: chrome.tabs.Tab,
) {
  if (tab.id === undefined) return undefined;
  const tabId = tab.id;
  const chatId = ownerChat(run);
  let group: string | undefined;
  await agentTabs.update(async (record) => {
    const entry = (record[chatId] ||= { tabs: [], groups: [] });
    entry.tabs = [...new Set([...entry.tabs, tabId])];
    const title = await groupTitle(chatId);
    group = await groupTab(entry, tab, title).catch(() => undefined);
    return record;
  });
  return group;
}

async function groupTab(
  entry: ChatTabs,
  tab: chrome.tabs.Tab,
  title: string,
): Promise<string | undefined> {
  const api = getBrowserApi();
  if (!api.tabs.group || !api.tabGroups || tab.id === undefined) return;
  // Groups the user closed are gone; a renamed or moved group is still ours.
  const groups = (
    await Promise.all(
      entry.groups.map((id) => api.tabGroups.get(id).catch(() => undefined)),
    )
  ).filter((group): group is chrome.tabGroups.TabGroup => !!group);
  entry.groups = groups.map((group) => group.id);
  const existing = groups.find((group) => group.windowId === tab.windowId);
  if (existing) {
    await api.tabs.group({ groupId: existing.id, tabIds: [tab.id] });
    if (existing.title !== entry.title || title === entry.title)
      return existing.title;
    await api.tabGroups.update(existing.id, { title });
    entry.title = title;
    return title;
  }
  const groupId = await api.tabs.group({
    tabIds: [tab.id],
    createProperties: { windowId: tab.windowId },
  });
  await api.tabGroups.update(groupId, { title });
  entry.groups.push(groupId);
  entry.title = title;
  return title;
}

async function groupTitle(chatId: string) {
  const chat = (await storage.chats.get()).find((item) => item.id === chatId);
  const title = chat?.title.replace(/\s+/g, " ").trim() || PRODUCT_NAME;
  return title.length > GROUP_TITLE_MAX_CHARS
    ? `${title.slice(0, GROUP_TITLE_MAX_CHARS - 1)}…`
    : title;
}

// Closes the tabs the agent opened for this chat (never the user's: only
// tabs recorded here) and forgets them, as a run nobody watches ends.
export async function closeAgentTabs(
  run: Pick<RunContext, "chatId" | "parentChatId">,
) {
  const chatId = ownerChat(run);
  let tabs: number[] = [];
  await agentTabs.update(async (record) => {
    tabs = record[chatId]?.tabs || [];
    delete record[chatId];
    return record;
  });
  await Promise.all(
    tabs.map((tabId) =>
      getBrowserApi()
        .tabs.remove(tabId)
        .catch(() => undefined),
    ),
  );
  return tabs;
}
