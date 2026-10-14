import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRunTab,
  startRunTab,
  withWorkingTab,
  workingTabNote,
} from "../src/background/run-tab";
import { pageTab } from "../src/background/page-agent";
import type { ChatMessage } from "../src/shared/types";
import { browserStorage, installBrowser } from "./helpers";

// Tabs that exist, and which one is active now.
function tabBrowser(ids: number[], active: number) {
  installBrowser();
  const session = browserStorage();
  const tabs = new Map(
    ids.map((id) => [
      id,
      {
        id,
        windowId: 1,
        title: `Tab ${id}`,
        url: `https://example.test/${id}`,
      } as chrome.tabs.Tab,
    ]),
  );
  const state = { active, tabs, session };
  Object.assign(chrome.storage, { session: session.area });
  Object.assign(chrome, {
    tabs: {
      get: async (id: number) => {
        const tab = tabs.get(id);
        if (!tab) throw new Error(`No tab with id: ${id}.`);
        return { ...tab, active: id === state.active };
      },
      query: async () =>
        tabs.has(state.active)
          ? [{ ...tabs.get(state.active), active: true }]
          : [],
    },
    windows: { getAll: async () => [] },
  });
  return state;
}

const message = (metadata?: Record<string, unknown>): ChatMessage => ({
  id: "user",
  role: "user",
  content: "Do it",
  createdAt: 1,
  metadata,
});

test("a run starts on the tab its message was sent with, not the active one", async () => {
  const state = tabBrowser([1, 2], 2);
  const { tab, start } = await startRunTab(
    "chat",
    message({ attachedTabs: [{ id: 1, title: "Tab 1" }] }),
  );
  assert.equal(start?.id, 1);
  // The user switches tabs: calls without a tabId stay on the run's tab.
  state.active = 2;
  assert.equal((await tab.target(undefined)).id, 1);
  assert.equal((await pageTab(tab, undefined)).id, 1);
});

test("without a tab in the message, a run starts on the active tab", async () => {
  tabBrowser([1, 2], 2);
  const { start } = await startRunTab("chat", message());
  assert.equal(start?.id, 2);
});

test("selected text names the tab when no tab is attached", async () => {
  tabBrowser([1, 2], 2);
  const { start } = await startRunTab(
    "chat",
    message({ selectedTexts: [{ text: "hi", tabId: 1 }] }),
  );
  assert.equal(start?.id, 1);
});

test("an explicit tabId is used and becomes the run's tab", async () => {
  tabBrowser([1, 2, 3], 1);
  const tab = createRunTab("chat", { id: 1 });
  assert.equal((await tab.target(3)).id, 3);
  assert.equal(tab.id, 3);
  assert.equal((await tab.target(undefined)).id, 3);
  await assert.rejects(tab.target(9), /Tab 9 does not exist/);
  assert.equal(tab.id, 3);
});

test("a closed run tab is an error, never the active tab", async () => {
  const state = tabBrowser([1, 2], 2);
  const tab = createRunTab("chat", { id: 1, title: "Tab 1" });
  await tab.target(undefined);
  state.tabs.delete(1);
  await assert.rejects(
    tab.target(undefined),
    /The tab you were working on \(tab 1: Tab 1\) was closed/,
  );
  await assert.rejects(pageTab(tab, undefined), /was closed/);
});

test("a sub-agent starts on its parent's tab and does not move it", async () => {
  tabBrowser([1, 2, 3], 3);
  const parent = createRunTab("parent", { id: 1 });
  const { tab: child, start } = await startRunTab(
    "child",
    message({ attachedTabs: [{ id: 3 }] }),
    parent.id,
  );
  assert.equal(start?.id, 1);
  await child.target(2);
  assert.equal(child.id, 2);
  assert.equal(parent.id, 1);
});

test("the chat's last tab carries over to its next message", async () => {
  tabBrowser([1, 2, 3], 2);
  const first = createRunTab("chat", { id: 1 });
  first.use({ id: 3, title: "Tab 3" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  // A message without a tab continues on the chat's tab.
  const next = await startRunTab("chat", message());
  assert.equal(next.start?.id, 3);
  // A message sent from another tab starts there, and names the earlier one.
  const other = await startRunTab(
    "chat",
    message({ attachedTabs: [{ id: 2 }] }),
  );
  assert.equal(other.start?.id, 2);
  assert.equal(other.earlier?.id, 3);
  const note = workingTabNote(other.start, other.earlier);
  assert.match(note, /^<working_tab>Tools without a tabId work on tab 2 /);
  assert.match(note, /Earlier in this chat you worked on tab 3 /);
});

test("the working tab joins the latest user message's context only", () => {
  const messages = [
    message({ context: "<selected_tabs/>" }),
    { ...message(), id: "a", role: "assistant" as const },
    message(),
  ];
  const next = withWorkingTab(messages, "<working_tab>x</working_tab>");
  assert.equal(next[0], messages[0]);
  assert.equal(next[2].metadata?.context, "<working_tab>x</working_tab>");
  assert.equal(messages[2].metadata, undefined);
  const withContext = withWorkingTab([messages[0]], "<working_tab/>");
  assert.equal(
    withContext[0].metadata?.context,
    "<selected_tabs/>\n\n<working_tab/>",
  );
});
