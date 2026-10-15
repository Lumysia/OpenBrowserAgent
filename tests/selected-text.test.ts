import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMessageText } from "../src/background/message-helpers";
import { createEditMessageDraft } from "../entrypoints/sidepanel/edit-message";
import {
  addSelectedText,
  handoffSelectedText,
  selectedTextExcerpt,
} from "../entrypoints/sidepanel/selected-text";
import {
  createSendMessagePlan,
  pickSendInputs,
} from "../entrypoints/sidepanel/send-message-plan";
import { buildSidepanelContext } from "../entrypoints/sidepanel/sidepanel-context";
import { getMessages } from "../src/shared/i18n";
import {
  internalInstruction,
  STALLED_STREAM_RETRY,
} from "../src/shared/model-notes";
import { selectedTextsFromMetadata } from "../src/shared/selected-text";
import type { Chat, SelectedText } from "../src/shared/types";

const t = getMessages("en-US");
const tab = { id: 7, title: "Notes", url: "https://example.com/notes" };
const selection: SelectedText = {
  text: "The quick <brown> fox\n\njumps.",
  tabId: 7,
  pageTitle: "Notes",
  pageUrl: "https://example.com/notes",
};
const emptyChat = (): Chat => ({
  id: "c",
  title: "",
  messages: [],
  createdAt: 1,
  updatedAt: 1,
});

test("a handoff's selection, tied to its tab only when the tab goes along", () => {
  const handoff = {
    id: "h",
    task: "ask" as const,
    text: "  picked  ",
    tabId: 7,
    pageTitle: "Notes",
    pageUrl: "https://example.com/notes",
    createdAt: 1,
  };
  assert.deepEqual(handoffSelectedText(handoff, tab), {
    text: "picked",
    tabId: 7,
    pageTitle: "Notes",
    pageUrl: "https://example.com/notes",
  });
  assert.equal(handoffSelectedText(handoff, null)?.tabId, undefined);
  assert.equal(handoffSelectedText({ ...handoff, text: " " }, tab), undefined);
  assert.equal(
    handoffSelectedText({ ...handoff, task: "summarizePage" }, tab),
    undefined,
  );
});

test("the same selection is not added twice", () => {
  const items = addSelectedText(addSelectedText([], selection), {
    ...selection,
  });
  assert.equal(items.length, 1);
  assert.equal(addSelectedText(items, { text: "other" }).length, 2);
});

test("titles show the start of the text on one line", () => {
  assert.equal(selectedTextExcerpt(" a\n\n b "), "a b");
  const long = selectedTextExcerpt("x".repeat(300));
  assert.equal(long.length, 120);
  assert.ok(long.endsWith("…"));
});

test("the selection reaches the agent as a selected_text block", async () => {
  const context = await buildSidepanelContext({
    attachedTabs: [tab],
    selectedElements: [],
    selectedTexts: [selection],
  });
  assert.match(
    context,
    /^<selected_text>\n<tab_id>7<\/tab_id>\n<title>Notes<\/title>\n<url>https:\/\/example\.com\/notes<\/url>\n<text>The quick &lt;brown&gt; fox\n\njumps\.<\/text>\n<\/selected_text>\n\n<selected_tabs>/,
  );
  const unreadable = await buildSidepanelContext({
    attachedTabs: [],
    selectedElements: [],
    selectedTexts: [{ text: "only text" }],
  });
  assert.equal(
    unreadable,
    "<selected_text>\n<text>only text</text>\n</selected_text>",
  );
});

test("sent selections stay in the message for edits and resends", async () => {
  const context = await buildSidepanelContext({
    attachedTabs: [tab],
    selectedElements: [],
    selectedTexts: [selection],
  });
  const { userMessage, nextChat } = createSendMessagePlan({
    chat: emptyChat(),
    text: "What does it mean?",
    t,
    sentTabs: [tab],
    sentElements: [],
    sentTexts: [selection],
    sentAttachments: [],
    context,
  });
  assert.equal(userMessage.content, "What does it mean?");
  assert.deepEqual(userMessage.metadata?.selectedTexts, [selection]);
  assert.match(
    renderMessageText(userMessage, {
      attachments: [],
      skills: [],
      latest: true,
    }),
    /<message_context>\n<selected_text>[\s\S]*The quick &lt;brown&gt; fox[\s\S]*<\/message_context>\n\n<message>\nWhat does it mean\?\n<\/message>/,
  );

  // In later turns the agent still has the text.
  assert.equal(
    renderMessageText(userMessage, {
      attachments: [],
      skills: [],
      latest: false,
    }),
    "<selected_text>\n<tab_id>7</tab_id>\n<title>Notes</title>\n<url>https://example.com/notes</url>\n<text>The quick &lt;brown&gt; fox\n\njumps.</text>\n</selected_text>\n\nWhat does it mean?",
  );

  const draft = createEditMessageDraft({
    chat: nextChat,
    message: userMessage,
    attachments: [],
  });
  assert.deepEqual(draft?.selectedTexts, [selection]);

  const resent = pickSendInputs({
    chat: nextChat,
    queued: false,
    editingMessage: null,
    resendMessage: userMessage,
    attachedTabs: [],
    selectedElements: [],
    selectedTexts: [{ text: "in the composer now" }],
    selectedSkills: [],
    pendingAttachments: [],
    uploadedAttachments: [],
  });
  assert.deepEqual(resent.sentTexts, [selection]);

  const fresh = pickSendInputs({
    chat: nextChat,
    queued: false,
    editingMessage: null,
    attachedTabs: [],
    selectedElements: [],
    selectedTexts: [selection],
    selectedSkills: [],
    pendingAttachments: [],
    uploadedAttachments: [],
  });
  assert.deepEqual(fresh.sentTexts, [selection]);
  const queued = pickSendInputs({
    chat: nextChat,
    queued: true,
    editingMessage: null,
    attachedTabs: [],
    selectedElements: [],
    selectedTexts: [selection],
    selectedSkills: [],
    pendingAttachments: [],
    uploadedAttachments: [],
  });
  assert.deepEqual(queued.sentTexts, []);
});

test("messages without selections, or with malformed ones, read as none", () => {
  assert.deepEqual(selectedTextsFromMetadata(undefined), []);
  // Written by the last release: no selectedTexts key at all.
  assert.deepEqual(selectedTextsFromMetadata({ attachedTabs: [tab] }), []);
  assert.deepEqual(
    selectedTextsFromMetadata({
      selectedTexts: [null, { text: 3 }, "x", { text: "kept" }],
    }),
    [{ text: "kept" }],
  );
  const { userMessage } = createSendMessagePlan({
    chat: emptyChat(),
    text: "Hi",
    t,
    sentTabs: [],
    sentElements: [],
    sentAttachments: [],
    context: "",
  });
  assert.equal("selectedTexts" in (userMessage.metadata || {}), false);
});

test("a stalled run's retry reaches the model as one internal instruction", () => {
  const text = renderMessageText(
    {
      id: "retry",
      role: "user",
      content: STALLED_STREAM_RETRY,
      createdAt: 1,
      metadata: { internalRetry: true },
    },
    { latest: true, attachments: [], skills: [] },
  );
  assert.equal(text, internalInstruction(STALLED_STREAM_RETRY));
  assert.equal(text.match(/<internal_instruction>/g)?.length, 1);
});
