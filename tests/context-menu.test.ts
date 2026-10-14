import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMessageText } from "../src/background/message-helpers";
import { pageDocument } from "../src/background/context-menu/copy-markdown";
import { pickSendInputs } from "../entrypoints/sidepanel/send-message-plan";
import {
  CONTEXT_MENU_ID,
  contextMenuEntries,
  DEFAULT_CONTEXT_MENU_SETTINGS,
  normalizeContextMenuSettings,
} from "../src/shared/context-menu";
import { mergePreferences } from "../src/shared/default-preferences";
import { getMessages } from "../src/shared/i18n";
import {
  readSidePanelHandoff,
  type SidePanelHandoff,
} from "../src/shared/side-panel-handoff";
import {
  isSidePanelRequest,
  sidePanelRequest,
} from "../src/shared/side-panel-requests";
import {
  normalizeSmartBarSettings,
  SMART_BAR_PAGE_ACTIONS,
  smartBarActions,
} from "../src/shared/smart-bar";
import type { Chat, ChatMessage } from "../src/shared/types";

const TITLES = {
  parent: "OpenBrowserAgent",
  ...getMessages("en-US").contextMenu.items,
  translatePage: "Translate this page",
};

test("the context menu is on by default; stored settings are cleaned", () => {
  assert.deepEqual(mergePreferences({}).contextMenu, {
    enabled: true,
    disabledItems: [],
  });
  // Written by the last release: no contextMenu key at all.
  assert.deepEqual(
    mergePreferences({ autoScroll: false }).contextMenu,
    DEFAULT_CONTEXT_MENU_SETTINGS,
  );
  assert.deepEqual(
    normalizeContextMenuSettings({
      enabled: "yes" as never,
      disabledItems: ["copyMarkdown", "copyMarkdown", "later" as never],
    }),
    { enabled: true, disabledItems: ["copyMarkdown"] },
  );
  assert.equal(normalizeContextMenuSettings({ enabled: false }).enabled, false);
});

test("menu entries: one parent, children with their own contexts", () => {
  const entries = contextMenuEntries(DEFAULT_CONTEXT_MENU_SETTINGS, TITLES, {
    tabContext: false,
  });
  assert.deepEqual(
    entries.map((entry) => [entry.id, entry.parentId, entry.contexts]),
    [
      [CONTEXT_MENU_ID.parent, undefined, ["all"]],
      [CONTEXT_MENU_ID.ask, CONTEXT_MENU_ID.parent, ["all"]],
      [CONTEXT_MENU_ID.summarizePage, CONTEXT_MENU_ID.parent, ["all"]],
      [CONTEXT_MENU_ID.translatePage, CONTEXT_MENU_ID.parent, ["all"]],
      [
        CONTEXT_MENU_ID.searchPage,
        CONTEXT_MENU_ID.parent,
        ["page", "frame", "link", "image", "video", "audio", "editable"],
      ],
      [CONTEXT_MENU_ID.searchSelection, CONTEXT_MENU_ID.parent, ["selection"]],
      [CONTEXT_MENU_ID.summarizeLink, CONTEXT_MENU_ID.parent, ["link"]],
      [CONTEXT_MENU_ID.copyMarkdown, CONTEXT_MENU_ID.parent, ["all"]],
    ],
  );
  assert.equal(entries[5].title, 'Search the web for "%s"');
  // The tab strip's menu where the browser has it, never for selections or
  // links.
  const withTabs = contextMenuEntries(DEFAULT_CONTEXT_MENU_SETTINGS, TITLES, {
    tabContext: true,
  });
  assert.deepEqual(
    withTabs
      .filter((entry) => entry.contexts.includes("tab"))
      .map((entry) => entry.id),
    [
      CONTEXT_MENU_ID.parent,
      CONTEXT_MENU_ID.ask,
      CONTEXT_MENU_ID.summarizePage,
      CONTEXT_MENU_ID.translatePage,
      CONTEXT_MENU_ID.searchPage,
      CONTEXT_MENU_ID.copyMarkdown,
    ],
  );
});

test("menu entries follow the settings; & is not an access key", () => {
  const ids = (disabledItems: string[], enabled = true) =>
    contextMenuEntries(
      normalizeContextMenuSettings({
        enabled,
        disabledItems: disabledItems as never,
      }),
      { ...TITLES, copyMarkdown: "Copy & paste" },
      { tabContext: false },
    ).map((entry) => entry.id);
  assert.deepEqual(ids([], false), []);
  assert.ok(!ids(["searchWeb"]).includes(CONTEXT_MENU_ID.searchSelection));
  assert.ok(!ids(["searchWeb"]).includes(CONTEXT_MENU_ID.searchPage));
  assert.deepEqual(
    ids([
      "ask",
      "summarizePage",
      "translatePage",
      "searchWeb",
      "summarizeLink",
      "copyMarkdown",
    ]),
    [],
  );
  const copy = contextMenuEntries(
    DEFAULT_CONTEXT_MENU_SETTINGS,
    { ...TITLES, copyMarkdown: "Copy & paste" },
    { tabContext: false },
  ).at(-1);
  assert.equal(copy?.title, "Copy && paste");
});

test("smart bar: AI search replaces Summarize, old settings still read", () => {
  assert.deepEqual(SMART_BAR_PAGE_ACTIONS, [
    "ask",
    "explain",
    "translate",
    "search",
    "copy",
  ]);
  // Written by the last release, with Summarize turned off.
  const stored = normalizeSmartBarSettings({
    enabled: true,
    disabledPageActions: ["summarize", "explain"] as never,
  });
  assert.deepEqual(stored.disabledPageActions, ["explain"]);
  assert.deepEqual(smartBarActions(stored, false), [
    "ask",
    "translate",
    "search",
    "copy",
  ]);
});

const base = {
  id: "handoff",
  windowId: 1,
  tabId: 7,
  pageTitle: "Release notes",
  pageUrl: "https://example.com/notes",
  createdAt: 1,
};

test("handoffs in an unknown shape are dropped", () => {
  assert.equal(readSidePanelHandoff(undefined), undefined);
  // The smart bar's handoff before tasks existed.
  assert.equal(
    readSidePanelHandoff({ id: "a", text: "x", createdAt: 1 }),
    undefined,
  );
  assert.equal(
    readSidePanelHandoff({ ...base, task: "continue", text: "x" }),
    undefined,
  );
  assert.equal(
    readSidePanelHandoff({ ...base, task: "summarizeLink" }),
    undefined,
  );
  assert.deepEqual(readSidePanelHandoff({ ...base, task: "summarizePage" }), {
    ...base,
    task: "summarizePage",
  });
});

test("requests: localized message, English instruction in the reply language", () => {
  const t = getMessages("zh-CN");
  const request = (handoff: SidePanelHandoff, attached = true) => {
    assert.ok(isSidePanelRequest(handoff));
    return sidePanelRequest(handoff, t, "zh-CN", attached);
  };
  const summary = request({ ...base, task: "summarizePage" });
  assert.equal(summary.content, "总结此页面");
  assert.match(
    summary.instruction,
    /^Summarize the page the user is viewing \(tab 7: "Release notes" at https:\/\/example\.com\/notes\)\./,
  );
  assert.match(summary.instruction, /Reply in Chinese \(China\)\.$/);

  const page = request({ ...base, task: "searchWeb" });
  assert.equal(page.content, "联网搜索此页面的相关信息");
  assert.match(page.instruction, /^Search the web for information related to/);
  assert.match(page.instruction, /citing your sources/);

  const selection = request({ ...base, task: "searchWeb", text: "a\n\nb" });
  // The text goes with the message as context, not in the message.
  assert.equal(selection.content, "联网搜索所选文本的相关信息");
  assert.match(
    selection.instruction,
    /^Search the web about the selected text in the message context/,
  );

  const link = request(
    { ...base, task: "summarizeLink", linkUrl: "https://example.com/full" },
    false,
  );
  assert.equal(link.content, "总结链接页面\n\nhttps://example.com/full");
  assert.match(
    link.instruction,
    /^Summarize the linked page at https:\/\/example\.com\/full, a link the user found on the page the user is viewing \("Release notes" at https:\/\/example\.com\/notes; the extension cannot read this tab/,
  );
  assert.equal(isSidePanelRequest({ ...base, task: "ask" }), false);
});

test("a request's instruction reaches the agent with its message only", () => {
  const message: ChatMessage = {
    id: "m",
    role: "user",
    content: "Summarize this page",
    createdAt: 1,
    metadata: { instruction: "Summarize the page. Reply in English." },
  };
  const options = { attachments: [], skills: [] };
  assert.match(
    renderMessageText(message, { ...options, latest: true }),
    /<message>\nSummarize this page\n<\/message>\n\n<request_instructions>\nSummarize the page\. Reply in English\.\n<\/request_instructions>$/,
  );
  assert.equal(
    renderMessageText(message, { ...options, latest: false }),
    "Summarize this page",
  );
});

test("a request sends its own tab and none of the composer's extras", () => {
  const chat: Chat = {
    id: "c",
    title: "",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const tab = { id: 7, title: "Release notes", url: "https://example.com" };
  const picked = pickSendInputs({
    chat,
    queued: false,
    editingMessage: null,
    attachedTabs: [{ id: 9, url: "https://other.example" }],
    selectedElements: [{ tagName: "p" } as never],
    selectedSkills: [{ id: "s", name: "s" } as never],
    pendingAttachments: [{ id: "a" } as never],
    uploadedAttachments: [{ id: "a" } as never],
    selectedTexts: [{ text: "in the composer" }],
    request: {
      instruction: "Do it.",
      tabs: [tab],
      selectedTexts: [{ text: "picked", tabId: 7 }],
    },
  });
  assert.deepEqual(picked.sentTabs, [tab]);
  assert.deepEqual(picked.sentTexts, [{ text: "picked", tabId: 7 }]);
  assert.deepEqual(
    [
      picked.sentElements,
      picked.sentSkills,
      picked.sentAttachments,
      picked.activeAttachments,
    ],
    [[], [], [], []],
  );
});

test("Copy as Markdown: a title heading, the address, the content", () => {
  assert.equal(
    pageDocument("Notes", "https://example.com/a", "Some text."),
    "# Notes\n\n<https://example.com/a>\n\nSome text.",
  );
  assert.equal(
    pageDocument("Notes", "https://example.com/a", "# Release\n\nSome text."),
    "# Release\n\n<https://example.com/a>\n\nSome text.",
  );
  assert.equal(
    pageDocument("", "https://example.com/a", "Text."),
    "<https://example.com/a>\n\nText.",
  );
});
