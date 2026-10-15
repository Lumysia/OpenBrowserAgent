import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { enUS } from "../src/shared/locales/en-US.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";

// Settings in six pages: older pages' links land on their tab, tabs change
// the address, and General starts with the translation language and lists
// the keyboard shortcuts.

const t = enUS;

const texts = (page, selector) =>
  page.call(
    (selector) =>
      [...document.querySelectorAll(selector)].map((element) =>
        element.textContent.trim(),
      ),
    selector,
  );

test(
  "settings navigation: six pages, tabs and redirects",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const browser = await launchExtension();
    try {
      const page = await browser.open(
        `chrome-extension://${browser.id}/options.html`,
      );
      await page.call(
        (key) => chrome.storage.local.set({ [key]: "en-US" }),
        STORAGE_KEYS.language,
      );
      // An older page's link.
      await page.call(() => (location.hash = "#/smart-bar"));
      await poll(
        async () => (await texts(page, ".nav-link")).length > 0,
        20000,
      );
      assert.deepEqual(await texts(page, ".nav-link"), [
        t.options.general,
        t.settings.providersModels,
        t.settings.agentsSkills,
        t.settings.onPages,
        t.options.sync,
        t.settings.advanced,
        t.common.help,
      ]);
      // The old Smart bar page is a tab of On pages now.
      assert.equal(await page.call(() => location.hash), OPTIONS_HASH.smartBar);
      assert.deepEqual(await texts(page, ".nav-link.active"), [
        t.settings.onPages,
      ]);
      assert.deepEqual(await texts(page, '[role="tab"][data-state="active"]'), [
        t.smartBar.settingsTitle,
      ]);
      // Only the site list the smart bar's mode uses.
      const siteLists = () =>
        page.call(
          (names) =>
            [...document.querySelectorAll("label, span, strong")]
              .map((element) => element.textContent.trim())
              .filter((text) => names.includes(text)),
          [t.smartBar.blockedSites, t.smartBar.allowedSites],
        );
      await poll(async () => (await siteLists()).length > 0);
      assert.deepEqual(
        [...new Set(await siteLists())],
        [t.smartBar.blockedSites],
      );
      await clickElement(page, '[role="radio"]', {
        text: t.smartBar.siteModeAllowList,
      });
      await poll(async () =>
        (await siteLists()).includes(t.smartBar.allowedSites),
      );
      assert.equal(
        (await siteLists()).includes(t.smartBar.blockedSites),
        false,
      );
      await clickElement(page, '[role="tab"]', { text: t.settings.rightClick });
      await poll(
        async () =>
          (await page.call(() => location.hash)) === OPTIONS_HASH.contextMenu,
      );
      await poll(async () =>
        (await texts(page, "h1")).includes(t.contextMenu.settingsTitle),
      );

      // Debug is Troubleshooting under Advanced.
      await page.call((hash) => (location.hash = hash), "#/debug");
      await poll(
        async () =>
          (await page.call(() => location.hash)) === OPTIONS_HASH.debug,
      );
      await poll(async () =>
        (await texts(page, "h1")).includes(t.settings.troubleshooting),
      );

      // General: the translation language first, then the shortcuts.
      await page.call((hash) => (location.hash = hash), OPTIONS_HASH.general);
      await poll(async () =>
        (await texts(page, ".settings-section-title")).includes(
          t.settings.shortcuts,
        ),
      );
      const sections = await texts(page, ".ui-card-title");
      assert.equal(sections[0], t.pageTranslate.targetLanguage);
      assert.ok(
        (await texts(page, "button")).includes(t.settings.changeShortcuts),
      );
      const shortcutRows = await texts(
        page,
        ".settings-toggle-list .settings-section-title",
      );
      assert.ok(
        shortcutRows.includes(t.settings.openSidePanelCommand),
        shortcutRows.join("|"),
      );
    } finally {
      await browser.close();
    }
  },
);
