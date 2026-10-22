import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement, pressKey } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  openSidePanel,
  openTaskList,
  seedTasks,
  startTaskExtension,
  storageValue,
  t,
  thisDevice,
} from "./browser-tasks-helpers.mjs";

// The confirmation before a destructive icon action (ConfirmIconButton),
// as the side panel shows it for deleting a task and clearing history:
// one styled popover with the action as its title, what it does, and
// Cancel (focused) before the action at the end.

// The open confirmation's layout, read from the page.
function confirmation(panel) {
  return panel.call(() => {
    const dialog = document.querySelector('[role="alertdialog"]');
    if (!dialog) return null;
    const box = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    const text = (id) => document.getElementById(id)?.textContent ?? "";
    const buttons = [...dialog.querySelectorAll("button")];
    const last = buttons.at(-1)?.getBoundingClientRect();
    return {
      surface: dialog.classList.contains("ui-popover-content"),
      title: text(dialog.getAttribute("aria-labelledby")),
      question: text(dialog.getAttribute("aria-describedby")),
      margins: [...dialog.querySelectorAll("strong, p")].map(
        (item) => getComputedStyle(item).marginTop,
      ),
      buttons: buttons.map((button) => button.textContent),
      focused: document.activeElement?.textContent ?? "",
      // How far the last action ends from the popover's padding.
      endGap:
        last &&
        box.right -
          parseFloat(style.borderRightWidth) -
          parseFloat(style.paddingRight) -
          last.right,
      fits: box.left >= 0 && box.right <= innerWidth,
    };
  });
}

async function assertConfirmation(panel, { title, question, action }) {
  const shown = await poll(() => confirmation(panel));
  assert.equal(shown.surface, true, "the popover itself is the alertdialog");
  assert.equal(shown.title, title);
  assert.equal(shown.question, question);
  assert.ok(
    shown.margins.every((margin) => margin === "0px"),
    `text keeps no browser margins: ${shown.margins}`,
  );
  assert.deepEqual(shown.buttons, [t.common.cancel, action]);
  assert.equal(shown.focused, t.common.cancel);
  assert.ok(
    Math.abs(shown.endGap) < 1,
    `actions end at the popover's padding (${shown.endGap}px off)`,
  );
  assert.equal(shown.fits, true);
}

const closed = (panel) =>
  poll(() => panel.call(() => !document.querySelector('[role="alertdialog"]')));

test(
  "deleting a task and clearing history ask in the same styled confirmation",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startTaskExtension({ model: () => ({ text: "" }) });
    const { browser, extensionUrl, options } = session;
    try {
      const deviceId = await thisDevice(options);
      const now = Date.now();
      await seedTasks(options, [
        {
          id: "news",
          title: "Morning news",
          prompt: "Summarize the news",
          agentId: "general-agent",
          trigger: { kind: "daily", time: "09:00" },
          deviceId,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await options.call(
        (chats) => chrome.storage.local.set({ chats }),
        [
          {
            id: "c1",
            title: "Ferries",
            createdAt: now,
            updatedAt: now,
            messageCount: 2,
          },
        ],
      );
      const panel = await openSidePanel(browser, extensionUrl);
      // A narrow side panel.
      await panel.send("Emulation.setDeviceMetricsOverride", {
        width: 360,
        height: 640,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await openTaskList(panel);
      const remove = `[data-task-id="news"] [aria-label="${t.tasks.actions.delete}"]`;
      await clickElement(panel, remove);
      await assertConfirmation(panel, {
        title: t.tasks.actions.delete,
        question: t.tasks.actions.deleteConfirm,
        action: t.common.delete,
      });
      // Escape and Cancel keep the task; the action deletes it.
      await pressKey(panel, "Escape");
      await closed(panel);
      await clickElement(panel, remove);
      await poll(() => confirmation(panel));
      await clickElement(panel, '[role="alertdialog"] button', {
        text: t.common.cancel,
        exact: true,
      });
      await closed(panel);
      assert.equal((await storageValue(options, STORAGE_KEYS.tasks)).length, 1);
      await clickElement(panel, remove);
      await poll(() => confirmation(panel));
      await clickElement(panel, '[role="alertdialog"] button', {
        text: t.common.delete,
        exact: true,
      });
      await poll(
        async () =>
          (await storageValue(options, STORAGE_KEYS.tasks)).length === 0,
      );
      // History's clear all is the same confirmation.
      await clickElement(panel, `[aria-label="${t.sidepanel.backToChat}"]`);
      await clickElement(panel, `[aria-label="${t.sidepanel.chatHistory}"]`);
      await clickElement(panel, `[aria-label="${t.sidepanel.clearAllChats}"]`);
      await assertConfirmation(panel, {
        title: t.sidepanel.clearAllChats,
        question: t.sidepanel.clearAllChatsConfirm,
        action: t.sidepanel.clearAllChatsAction,
      });
    } finally {
      await session.close();
    }
  },
);
