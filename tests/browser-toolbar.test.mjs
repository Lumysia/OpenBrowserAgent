import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_MENU_ID } from "../src/shared/action-menu.ts";
import { SIDE_PANEL_SHORTCUT } from "../src/shared/config.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";

// The toolbar button: its keyboard shortcut and its own right-click menu.

test(
  "the toolbar button's shortcut registers",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension();
    try {
      const commands = await session.options.call(() =>
        chrome.commands.getAll(),
      );
      const action = commands.find(
        (command) => command.name === "_execute_action",
      );
      // Chrome leaves the shortcut empty when it refuses the suggested key.
      assert.equal(action?.shortcut, SIDE_PANEL_SHORTCUT.default);
    } finally {
      await session.close();
    }
  },
);

const VIDEO_PAGE = `<!doctype html><html lang="en"><head><title>Video</title></head><body>
<video id="video" muted style="width:480px;height:270px;background:#000"></video>
</body></html>`;

// Records what the background creates and updates in the menus, per item.
function recordMenus() {
  const menus = chrome.contextMenus;
  self.menuItems = {};
  const record = (id, properties) => {
    self.menuItems[id] = { ...self.menuItems[id], ...properties };
  };
  const create = menus.create.bind(menus);
  const update = menus.update.bind(menus);
  menus.create = (properties, callback) => {
    record(properties.id, properties);
    return create(properties, callback);
  };
  menus.update = (id, properties, callback) => {
    record(id, properties);
    return update(id, properties, callback);
  };
  // Builds the menus again from scratch, as after a browser update.
  chrome.runtime.onInstalled.dispatch({ reason: "chrome_update" });
}

test(
  "the toolbar button's right-click menu",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const session = await startPageTranslate({
      pages: {
        "/article": articlePage({ paragraphs: 3 }),
        "/video": VIDEO_PAGE,
      },
      answer: fixtureTranslator(),
      preferences: { pageTranslate: { targetLanguage: "fr" } },
    });
    const { browser, url, worker, options } = session;
    const item = (id) => worker.call((id) => self.menuItems[id], id);
    const itemIs = (id, check) =>
      poll(async () => {
        const value = await item(id);
        return value && check(value) ? value : null;
      });
    const click = (pageUrl, menuItemId, checked) =>
      worker.call(
        async ({ pageUrl, menuItemId, checked }) => {
          const [tab] = await chrome.tabs.query({ url: pageUrl });
          chrome.contextMenus.onClicked.dispatch(
            { menuItemId, checked, editable: false, pageUrl: tab.url },
            tab,
          );
        },
        { pageUrl, menuItemId, checked },
      );
    const preferences = () =>
      options.call(
        async (key) => (await chrome.storage.local.get(key))[key],
        STORAGE_KEYS.preferences,
      );
    try {
      const page = await browser.open(url("/article"));
      await page.send("Page.bringToFront");
      await worker.call(recordMenus);

      await t.test("it shows the active page's state", async () => {
        await itemIs(
          ACTION_MENU_ID.translatePage,
          (value) =>
            value.title === "Translate this page" && value.enabled !== false,
        );
        await itemIs(
          ACTION_MENU_ID.translateInto,
          (value) => value.title === "Translate into: French",
        );
        await itemIs(ACTION_MENU_ID.pageButton, (value) => value.checked);
        await itemIs(ACTION_MENU_ID.smartBar, (value) => !value.checked);
        await itemIs(ACTION_MENU_ID.subtitles, (value) => !value.visible);
        const french = await item(`${ACTION_MENU_ID.translateInto}:fr`);
        assert.equal(french.type, "radio");
        assert.equal(french.checked, true);
      });

      await t.test("the site switches write the site lists", async () => {
        await click(url("/article"), ACTION_MENU_ID.pageButton, false);
        await poll(async () =>
          (await preferences()).pageTranslate.pageButtonHiddenHosts.includes(
            "127.0.0.1",
          ),
        );
        await itemIs(ACTION_MENU_ID.pageButton, (value) => !value.checked);
        await click(url("/article"), ACTION_MENU_ID.smartBar, true);
        const { smartBar } = await poll(async () => {
          const stored = await preferences();
          return stored.smartBar?.enabled ? stored : null;
        });
        assert.equal(smartBar.siteMode, "allowList");
        assert.deepEqual(smartBar.allowedHosts, ["127.0.0.1"]);
        await itemIs(ACTION_MENU_ID.smartBar, (value) => value.checked);
      });

      await t.test("Translate into picks the language", async () => {
        await click(
          url("/article"),
          `${ACTION_MENU_ID.translateInto}:de`,
          true,
        );
        await poll(
          async () =>
            (await preferences()).pageTranslate.targetLanguage === "de",
        );
        await itemIs(
          ACTION_MENU_ID.translateInto,
          (value) => value.title === "Translate into: German",
        );
      });

      await t.test(
        "it translates the page and shows the original",
        async () => {
          await click(url("/article"), ACTION_MENU_ID.translatePage);
          await poll(() => translationIn(page, "#intro"));
          await itemIs(
            ACTION_MENU_ID.translatePage,
            (value) => value.title === "Show original",
          );
          await click(url("/article"), ACTION_MENU_ID.translatePage);
          await poll(async () => !(await translationIn(page, "#intro")));
          await itemIs(
            ACTION_MENU_ID.translatePage,
            (value) => value.title === "Translate this page",
          );
        },
      );

      await t.test("subtitles show on a page with a video", async () => {
        const video = await browser.open(url("/video"));
        await video.send("Page.bringToFront");
        await itemIs(ACTION_MENU_ID.subtitles, (value) => value.visible);
        await click(url("/video"), ACTION_MENU_ID.subtitles, true);
        await itemIs(ACTION_MENU_ID.subtitles, (value) => value.checked);
        await click(url("/video"), ACTION_MENU_ID.subtitles, false);
        await itemIs(ACTION_MENU_ID.subtitles, (value) => !value.checked);
        // Back on the article: no video, no item.
        await page.send("Page.bringToFront");
        await itemIs(ACTION_MENU_ID.subtitles, (value) => !value.visible);
      });
    } finally {
      await session.close();
    }
  },
);
