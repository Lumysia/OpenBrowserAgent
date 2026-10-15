import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { enUS } from "../src/shared/locales/en-US.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import {
  BROWSER_TEST_TIMEOUT,
  fixtureProvider,
  startExtension,
} from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// Controls that delete data ask first, and nothing duplicates the header's
// "New chat": clearing all chats (pinned ones included) and deleting an
// agent confirm; a new agent opens at once.

const t = enUS;

const chat = (id, extra = {}) => ({
  id,
  title: `Chat ${id}`,
  kind: "normal",
  messageCount: 1,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

test(
  "guards: clear all chats and agent deletion confirm; no New Chat pill",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension({
      storage: (baseUrl) => ({
        [STORAGE_KEYS.language]: "en-US",
        [STORAGE_KEYS.provider]: { fixture: fixtureProvider(baseUrl) },
        [STORAGE_KEYS.preferences]: { selectedModelId: "fixture" },
        [STORAGE_KEYS.chats]: [chat("a", { pinnedAt: 2 }), chat("b")],
        ...Object.fromEntries(
          ["a", "b"].map((id) => [
            `${STORAGE_KEYS.chats}/${id}`,
            {
              messages: [
                { id: `${id}-1`, role: "user", content: "Hi", createdAt: 1 },
              ],
            },
          ]),
        ),
      }),
    });
    const { browser, extensionUrl, options } = session;
    try {
      const panel = await browser.open(extensionUrl("sidepanel.html"));
      await poll(() =>
        panel.call(() => !!document.querySelector(".composer-box textarea")),
      );
      // "New chat" lives only in the header.
      assert.equal(
        await panel.call(
          (label) =>
            [...document.querySelectorAll(".composer button")].some((button) =>
              button.textContent.includes(label),
            ),
          t.words.newChat,
        ),
        false,
      );

      const storedChats = () =>
        panel.call(
          async (key) => (await chrome.storage.local.get(key))[key]?.length,
          STORAGE_KEYS.chats,
        );
      await clickElement(
        panel,
        `button[aria-label="${t.sidepanel.chatHistory}"]`,
      );
      const trash = `button[aria-label="${t.sidepanel.clearAllChats}"]`;
      await clickElement(panel, trash);
      await poll(() =>
        panel.call(
          (text) => document.body.innerText.includes(text),
          t.sidepanel.clearAllChatsConfirm,
        ),
      );
      await clickElement(panel, '[role="alertdialog"] button', {
        text: t.common.cancel,
      });
      assert.equal(await storedChats(), 2);
      await clickElement(panel, trash);
      await clickElement(panel, '[role="alertdialog"] button', {
        text: t.sidepanel.clearAllChatsAction,
      });
      await poll(async () => (await storedChats()) === 0);

      // A new agent opens; deleting it asks first.
      await options.send("Page.navigate", {
        url: extensionUrl(`options.html${OPTIONS_HASH.agents}`),
      });
      await clickElement(options, "button", { text: t.options.newAgent });
      const agents = () =>
        options.call(
          async (key) => (await chrome.storage.local.get(key))[key] ?? [],
          STORAGE_KEYS.agents,
        );
      const added = await poll(async () =>
        (await agents()).find((agent) => !agent.builtin),
      );
      await poll(() =>
        options.call(
          (id) =>
            document.getElementById(`agent-${id}`)?.dataset.state === "open",
          added.id,
        ),
      );
      const deleteButton = `#agent-${added.id} button`;
      await clickElement(options, deleteButton, {
        text: t.options.deleteAgent,
      });
      assert.ok(
        await poll(async () => (await agents()).some((a) => a.id === added.id)),
      );
      await clickElement(options, deleteButton, {
        text: added.workspace
          ? t.options.deleteAgentWithWorkspace
          : t.common.confirm,
      });
      await poll(async () =>
        (await agents()).every((agent) => agent.id !== added.id),
      );
    } finally {
      await session.close();
    }
  },
);
