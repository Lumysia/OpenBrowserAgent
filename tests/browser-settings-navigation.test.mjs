import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { enUS } from "../src/shared/locales/en-US.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { launchExtension, poll } from "./chromium.mjs";

// Settings in six pages, with each group's sub-pages listed under it in the
// sidebar: older pages' links land on their sub-page, the sidebar opens
// sub-pages and groups, and General lists the keyboard shortcuts.

const t = enUS;

const GROUPS = ".settings-nav:not(.settings-nav-sub) > li > .nav-link";
const SUB_PAGES = ".settings-nav-sub .nav-link";

const texts = (page, selector) =>
  page.call(
    (selector) =>
      [...document.querySelectorAll(selector)].map((element) =>
        element.textContent.trim(),
      ),
    selector,
  );

test(
  "settings navigation: six pages, sub-pages in the sidebar and redirects",
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
      assert.deepEqual(await texts(page, GROUPS), [
        t.options.general,
        t.settings.providersModels,
        t.settings.agentsSkills,
        t.settings.onPages,
        t.options.sync,
        t.settings.advanced,
        t.common.help,
      ]);
      // Every group's sub-pages are always listed.
      assert.deepEqual(await texts(page, SUB_PAGES), [
        t.options.agents,
        t.options.skills,
        t.settings.translate,
        t.smartBar.settingsTitle,
        t.settings.rightClick,
        t.options.mcpServers,
        t.options.localExecutionBridges,
        t.settings.troubleshooting,
      ]);
      // The old Smart bar page is a sub-page of On pages now: it is the
      // current page, and its group is marked as holding it.
      assert.equal(await page.call(() => location.hash), OPTIONS_HASH.smartBar);
      assert.deepEqual(await texts(page, '.nav-link[aria-current="page"]'), [
        t.smartBar.settingsTitle,
      ]);
      assert.deepEqual(await texts(page, ".nav-link.contains-active"), [
        t.settings.onPages,
      ]);
      assert.equal(
        await page.call(() => !!document.querySelector('[role="tablist"]')),
        false,
      );
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
      await clickElement(page, SUB_PAGES, { text: t.settings.rightClick });
      await poll(
        async () =>
          (await page.call(() => location.hash)) === OPTIONS_HASH.contextMenu,
      );
      await poll(async () =>
        (await texts(page, "h1")).includes(t.contextMenu.settingsTitle),
      );

      // Skills, from the sidebar.
      await clickElement(page, SUB_PAGES, { text: t.options.skills });
      await poll(
        async () =>
          (await page.call(() => location.hash)) === OPTIONS_HASH.skills,
      );
      await poll(async () =>
        (await texts(page, "h1")).includes(t.options.skills),
      );
      // A group's label opens its first sub-page.
      await clickElement(page, GROUPS, { text: t.settings.advanced });
      await poll(
        async () => (await page.call(() => location.hash)) === OPTIONS_HASH.mcp,
      );
      await poll(async () =>
        (await texts(page, "h1")).includes(t.options.mcpServers),
      );
      assert.deepEqual(await texts(page, '.nav-link[aria-current="page"]'), [
        t.options.mcpServers,
      ]);

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
