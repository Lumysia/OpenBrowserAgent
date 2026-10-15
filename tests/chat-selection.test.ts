import assert from "node:assert/strict";
import test from "node:test";
import {
  chatSelectionReducer,
  initialChatSelection,
} from "../entrypoints/sidepanel/chat-selection";
import { createChatDraft } from "../entrypoints/sidepanel/chat-state-actions";
import type { ChatSummary } from "../src/shared/types";

const summary = (id: string): ChatSummary =>
  ({
    id,
    title: id,
    messageCount: 1,
    createdAt: 1,
    updatedAt: 1,
  }) as ChatSummary;

test("the first draft stays open while history loads and once it is stored", () => {
  const start = initialChatSelection("New chat");
  const draft = createChatDraft("New chat");
  const loaded = chatSelectionReducer(start, {
    type: "listChanged",
    chats: [summary("a")],
    draft,
  });
  assert.equal(loaded, start);
  const stored = chatSelectionReducer(loaded, {
    type: "listChanged",
    chats: [summary("a"), summary(start.activeChatId)],
    draft,
  });
  assert.equal(stored.activeChatId, start.activeChatId);
  assert.equal(stored.draftChat, undefined);
});

test("an open chat closed elsewhere gives way to a new draft", () => {
  const start = chatSelectionReducer(initialChatSelection("New chat"), {
    type: "open",
    chatId: "a",
  });
  assert.equal(start.draftChat, undefined);
  const draft = createChatDraft("New chat");
  for (const chats of [[summary("b")], []]) {
    const next = chatSelectionReducer(start, {
      type: "listChanged",
      chats,
      draft,
    });
    assert.equal(next.activeChatId, draft.id);
    assert.equal(next.draftChat, draft);
  }
});

test("only a user's pick counts as a request to open", () => {
  const start = initialChatSelection("New chat");
  const imported = chatSelectionReducer(start, { type: "open", chatId: "a" });
  assert.equal(imported.openCount, 0);
  const picked = chatSelectionReducer(imported, {
    type: "open",
    chatId: "a",
    request: true,
  });
  assert.equal(picked.openCount, 1);
  const created = chatSelectionReducer(picked, {
    type: "create",
    chat: createChatDraft("New chat"),
  });
  assert.equal(created.openCount, 1);
  assert.equal(created.activeChatId, created.draftChat?.id);
});
