import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adoptAgentTab,
  agentTabIds,
  openAgentTab,
} from "../src/background/agent-tabs";
import { installChrome } from "./fake-chrome";

// A browser with windows, tabs and tab groups, enough for the group logic.
function groupBrowser({ tabGroups = true } = {}) {
  installChrome();
  const tabs = new Map<number, chrome.tabs.Tab>();
  const groups = new Map<number, chrome.tabGroups.TabGroup>();
  const state = { window: 1, nextTab: 1, nextGroup: 100, tabs, groups };
  Object.assign(chrome, {
    tabs: {
      create: async (props: chrome.tabs.CreateProperties) => {
        const tab = {
          id: state.nextTab++,
          windowId: state.window,
          url: props.url,
          groupId: -1,
        } as chrome.tabs.Tab;
        tabs.set(tab.id!, tab);
        return tab;
      },
      ...(tabGroups
        ? {
            group: async (options: chrome.tabs.GroupOptions) => {
              const tabIds = [options.tabIds].flat() as number[];
              const groupId =
                options.groupId ??
                (() => {
                  const id = state.nextGroup++;
                  groups.set(id, {
                    id,
                    windowId: options.createProperties!.windowId!,
                    title: "",
                  } as chrome.tabGroups.TabGroup);
                  return id;
                })();
              for (const id of tabIds) tabs.get(id)!.groupId = groupId;
              return groupId;
            },
          }
        : {}),
    },
    ...(tabGroups
      ? {
          tabGroups: {
            get: async (id: number) => {
              if (!groups.has(id)) throw new Error(`No group ${id}`);
              return { ...groups.get(id)! };
            },
            update: async (id: number, props: { title?: string }) =>
              Object.assign(groups.get(id)!, props),
          },
        }
      : {}),
  });
  return state;
}

const chat = { chatId: "chat-1" };

test("tabs a chat opens share one group per window and are marked as its own", async () => {
  const state = groupBrowser();
  await chrome.storage.local.set({
    chats: [{ id: "chat-1", title: "Compare  running shoes", createdAt: 1 }],
  });
  const first = await openAgentTab(chat, { url: "https://a.test" });
  const second = await openAgentTab(chat, { url: "https://b.test" });
  // A sub-agent of the chat uses the chat's group.
  const third = await openAgentTab(
    { chatId: "sub", parentChatId: "chat-1" },
    { url: "https://c.test" },
  );
  assert.equal(first.group, "Compare running shoes");
  const groupId = state.tabs.get(first.tab.id!)!.groupId;
  assert.equal(state.tabs.get(second.tab.id!)!.groupId, groupId);
  assert.equal(state.tabs.get(third.tab.id!)!.groupId, groupId);
  assert.equal(state.groups.size, 1);

  // Another chat gets its own group; another window a new group.
  await openAgentTab({ chatId: "chat-2" }, { url: "https://d.test" });
  state.window = 2;
  const other = await openAgentTab(chat, { url: "https://e.test" });
  assert.equal(state.groups.size, 3);
  assert.equal(
    state.groups.get(state.tabs.get(other.tab.id!)!.groupId!)!.windowId,
    2,
  );

  assert.deepEqual(
    [...(await agentTabIds(chat))],
    [first.tab.id, second.tab.id, third.tab.id, other.tab.id],
  );
});

test("a renamed group keeps its name and a closed one is replaced", async () => {
  const state = groupBrowser();
  const first = await openAgentTab(chat, { url: "https://a.test" });
  const groupId = state.tabs.get(first.tab.id!)!.groupId!;
  assert.equal(state.groups.get(groupId)!.title, "OpenBrowserAgent");
  state.groups.get(groupId)!.title = "Mine";
  const second = await openAgentTab(chat, { url: "https://b.test" });
  assert.equal(second.group, "Mine");
  assert.equal(state.tabs.get(second.tab.id!)!.groupId, groupId);

  state.groups.delete(groupId);
  const third = await openAgentTab(chat, { url: "https://c.test" });
  assert.notEqual(state.tabs.get(third.tab.id!)!.groupId, groupId);
  assert.equal(third.group, "OpenBrowserAgent");
});

test("without tab groups tabs open normally and are still recorded", async () => {
  groupBrowser({ tabGroups: false });
  const opened = await openAgentTab(chat, { url: "https://a.test" });
  assert.equal(opened.group, undefined);
  const kept = { id: 42, windowId: 1 } as chrome.tabs.Tab;
  await adoptAgentTab(chat, kept);
  assert.deepEqual([...(await agentTabIds(chat))], [opened.tab.id, 42]);
});
