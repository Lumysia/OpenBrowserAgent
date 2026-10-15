import assert from "node:assert/strict";
import { test } from "node:test";
import { SYNC_PASSPHRASE_MIN_LENGTH } from "../src/shared/config.ts";
import { enUS } from "../src/shared/locales/en-US.ts";
import { STORAGE_KEYS, SYNC_GROUPS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement, typeText } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";

// The Sync page on browser account sync: one choice of backend, what syncs
// shown once, settings always sync, chats and files need WebDAV, and turning keys on asks for a passphrase first, which
// the background checks, stores and writes to the browser's sync storage.

const t = enUS;

// The rows of the data groups, as the page shows them.
const rows = (page) =>
  page.call(() =>
    [...document.querySelectorAll(".settings-toggle-row")].map((row) => ({
      title: row.querySelector(".settings-section-title")?.textContent.trim(),
      description: row.querySelector(".ui-card-description")?.textContent,
      badge: row.querySelector(".ui-badge")?.textContent ?? null,
      switch: row.querySelector('[role="switch"]')
        ? {
            checked:
              row.querySelector('[role="switch"]').ariaChecked === "true",
            disabled: row.querySelector('[role="switch"]').disabled,
          }
        : null,
    })),
  );

const feedback = (page) =>
  page.call(
    () =>
      document.querySelector('.settings-toggle-row [role="alert"]')
        ?.textContent,
  );

async function setPassphrase(page, passphrase, repeat) {
  await page.call(() =>
    document
      .querySelectorAll('.settings-toggle-row input[type="password"]')
      .forEach((input) => {
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        set.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }),
  );
  const fields = '.settings-toggle-row input[type="password"]';
  await typeText(page, passphrase, `${fields}:nth-of-type(1)`);
  await page.call(
    (selector) => document.querySelectorAll(selector)[1].focus(),
    fields,
  );
  await page.send("Input.insertText", { text: repeat });
  await clickElement(page, "button", { text: t.sync.passphraseSave });
}

test(
  "sync settings: groups on browser account sync and the passphrase",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension();
    try {
      const page = await browser.open(
        `chrome-extension://${browser.id}/options.html#/sync`,
      );
      await page.call(
        ({ language, backend }) =>
          chrome.storage.local.set({
            [language]: "en-US",
            [backend]: "browser-sync",
          }),
        {
          language: STORAGE_KEYS.language,
          backend: STORAGE_KEYS.activeSyncBackendId,
        },
      );
      // The first page of a new profile takes a while to load.
      await poll(async () => (await rows(page)).length >= 4, 20000);
      // One choice of where to sync, with browser account sync on.
      const choice = await page.call(() =>
        [...document.querySelectorAll('[role="radio"]')].map((item) => ({
          label: item.textContent.trim(),
          on: item.dataset.state === "on",
        })),
      );
      assert.deepEqual(choice, [
        { label: t.sync.choiceOff, on: false },
        { label: t.sync.choiceBrowser, on: true },
        { label: t.sync.choiceWebDav, on: false },
      ]);
      const buttons = await page.call(() =>
        [...document.querySelectorAll("button")].map((button) =>
          button.textContent.trim(),
        ),
      );
      // Another device joins browser account sync by choosing it: no code.
      assert.equal(buttons.includes(t.sync.copyCode), false);
      assert.ok(buttons.includes(t.sync.pasteCode));
      const shown = await rows(page);
      const row = (title) => shown.find((item) => item.title === title);
      assert.deepEqual(row(t.sync.groupSettings), {
        title: t.sync.groupSettings,
        description: t.sync.groupSettingsDescription,
        badge: t.sync.groupAlways,
        switch: null,
      });
      for (const title of [t.sync.groupChats, t.sync.groupFiles]) {
        assert.equal(row(title).description, t.sync.webDavOnly, title);
        assert.deepEqual(row(title).switch, { checked: false, disabled: true });
      }
      assert.deepEqual(row(t.sync.groupKeys).switch, {
        checked: false,
        disabled: false,
      });

      // Turning keys on asks for the passphrase first.
      await clickElement(
        page,
        `[role="switch"][aria-label="${t.sync.groupKeys}"]`,
      );
      await poll(() =>
        page.call(
          () =>
            document.querySelectorAll(
              '.settings-toggle-row input[type="password"]',
            ).length === 2,
        ),
      );
      await setPassphrase(page, "short", "short");
      assert.equal(
        await poll(() => feedback(page)),
        t.sync.passphraseTooShort.replace(
          "{min}",
          String(SYNC_PASSPHRASE_MIN_LENGTH),
        ),
      );
      await setPassphrase(page, "correct horse", "correct house");
      assert.equal(
        await poll(
          async () => (await feedback(page)) === t.sync.passphraseMismatch,
        ),
        true,
      );
      await setPassphrase(
        page,
        "correct horse battery",
        "correct horse battery",
      );
      // Set, turned on, and a round wrote the keyring to sync storage.
      await clickElement(page, "button", { text: t.sync.passphraseChange });
      const stored = await page.call(
        async ({ groups, keys, keyring }) => {
          const local = await chrome.storage.local.get(null);
          const sync = await chrome.storage.sync.get("m");
          return {
            on: local[groups]?.[keys],
            key: Object.keys(local).some((key) =>
              key.startsWith(`${keyring}:`),
            ),
            server: !!sync.m?.keyring,
          };
        },
        {
          groups: STORAGE_KEYS.syncGroups,
          keys: SYNC_GROUPS.keys,
          keyring: STORAGE_KEYS.syncKeyring,
        },
      );
      assert.deepEqual(stored, { on: true, key: true, server: true });

      // WebDAV without a server shows its fields and keeps sync where it
      // was until it connects; Off hides what syncs.
      const active = () =>
        page.call(
          async (key) => (await chrome.storage.local.get(key))[key],
          STORAGE_KEYS.activeSyncBackendId,
        );
      await clickElement(page, '[role="radio"]', { text: t.sync.choiceWebDav });
      await poll(() =>
        page.call(
          () => !!document.querySelector('input[placeholder^="https"]'),
        ),
      );
      assert.equal(await active(), "browser-sync");
      await clickElement(page, '[role="radio"]', { text: t.sync.choiceOff });
      await poll(async () => (await active()) === "local");
      await poll(async () => (await rows(page)).length === 0);
    } finally {
      await browser.close();
    }
  },
);
