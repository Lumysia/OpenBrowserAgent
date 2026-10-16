import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_COMMAND, SIDE_PANEL_COMMAND } from "../src/shared/commands.ts";
import { SIDE_PANEL_SHORTCUT } from "../src/shared/config.ts";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { getMessages } from "../src/shared/i18n.ts";
import { TOOLBAR_MENU_PAGE } from "../src/shared/side-panel.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT, startExtension } from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";

// The toolbar button, its menu, and the side panel's keyboard shortcut.

const t = getMessages("en-US");

test(
  "the side panel's shortcut registers; the toolbar button has none",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension();
    try {
      const commands = await session.options.call(() =>
        chrome.commands.getAll(),
      );
      const shortcut = (name) =>
        commands.find((command) => command.name === name)?.shortcut;
      // Chrome leaves the shortcut empty when it refuses the suggested key.
      assert.equal(shortcut(SIDE_PANEL_COMMAND), SIDE_PANEL_SHORTCUT.default);
      assert.equal(shortcut(ACTION_COMMAND), "");
    } finally {
      await session.close();
    }
  },
);

const VIDEO_PAGE = `<!doctype html><html lang="en"><head><title>Video</title></head><body>
<video id="video" muted style="width:480px;height:270px;background:#000"></video>
</body></html>`;

// The menu as it shows: the heading and each tile by label, with its state
// and tooltip text (what screen readers read as its description).
function menuView(menu) {
  return menu.call(() => ({
    site: document.querySelector(".toolbar-menu-site")?.textContent,
    tiles: Object.fromEntries(
      [...document.querySelectorAll(".ui-toggle-tile")].map((tile) => [
        tile.querySelector(".ui-toggle-tile-label").textContent,
        {
          on: tile.getAttribute("aria-pressed") === "true",
          unavailable: tile.getAttribute("aria-disabled") === "true",
          tooltip: document.getElementById(
            tile.getAttribute("aria-describedby"),
          )?.textContent,
        },
      ]),
    ),
  }));
}

const pressTile = (menu, label) =>
  menu.call(
    (label) =>
      [...document.querySelectorAll(".ui-toggle-tile")]
        .find(
          (tile) =>
            tile.querySelector(".ui-toggle-tile-label").textContent === label,
        )
        .click(),
    label,
  );

test(
  "the toolbar menu: the active page's tools, Translate into and the side panel",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t_) => {
    const session = await startPageTranslate({
      pages: {
        "/article": articlePage({ paragraphs: 3 }),
        "/video": VIDEO_PAGE,
      },
      answer: fixtureTranslator(),
      preferences: { pageTranslate: { targetLanguage: "fr" } },
    });
    const { browser, url, worker, options, extensionUrl } = session;
    const p = t.pageTools;
    const preferences = () =>
      options.call(
        async (key) => (await chrome.storage.local.get(key))[key],
        STORAGE_KEYS.preferences,
      );
    const isOpen = async (target) =>
      (await browser.targets()).some((item) => item.url === target);
    try {
      // The menu in a tab of the same window: the active tab is the page.
      const menu = await browser.open(extensionUrl(TOOLBAR_MENU_PAGE.slice(1)));
      const page = await browser.open(url("/article"));
      await page.send("Page.bringToFront");
      const menuIs = (check) =>
        poll(async () => {
          const value = await menuView(menu);
          return check(value) ? value : null;
        });
      // Records the titles the right-click menu's subtitles item gets.
      await worker.call((id) => {
        const menus = chrome.contextMenus;
        const update = menus.update.bind(menus);
        self.subtitleTitles = [];
        menus.update = (itemId, properties, callback) => {
          if (itemId === id) self.subtitleTitles.push(properties.title);
          return update(itemId, properties, callback);
        };
      }, CONTEXT_MENU_ID.translateSubtitles);
      const subtitleTitle = () => worker.call(() => self.subtitleTitles.at(-1));

      await t_.test("it is the toolbar button's popup", async () => {
        const popup = await worker.call(() => chrome.action.getPopup({}));
        assert.equal(popup, extensionUrl(TOOLBAR_MENU_PAGE.slice(1)));
      });

      await t_.test("it shows the page's site and tools", async () => {
        const view = await menuIs((value) => value.site === "127.0.0.1");
        assert.deepEqual(view.tiles, {
          [p.translate]: {
            on: false,
            unavailable: false,
            tooltip: t.pageTranslate.menu.translatePage,
          },
          [p.smartBarLabel]: {
            on: false,
            unavailable: false,
            tooltip: p.smartBar,
          },
          [p.subtitlesLabel]: {
            on: false,
            unavailable: true,
            tooltip: p.noVideo,
          },
        });
      });

      await t_.test(
        "Translate translates the page and shows the original again",
        async () => {
          await pressTile(menu, p.translate);
          await poll(() => translationIn(page, "#intro"));
          await menuIs(
            (value) =>
              value.tiles[p.translate].on &&
              value.tiles[p.translate].tooltip ===
                t.pageTranslate.menu.showOriginal,
          );
          await pressTile(menu, p.translate);
          await poll(async () => !(await translationIn(page, "#intro")));
          await menuIs((value) => !value.tiles[p.translate].on);
        },
      );

      await t_.test("Smart bar changes the site setting", async () => {
        await pressTile(menu, p.smartBarLabel);
        await menuIs((value) => value.tiles[p.smartBarLabel].on);
        const { smartBar } = await preferences();
        assert.equal(smartBar.enabled, true);
        assert.equal(smartBar.siteMode, "allowList");
        assert.deepEqual(smartBar.allowedHosts, ["127.0.0.1"]);
        await pressTile(menu, p.smartBarLabel);
        await menuIs((value) => !value.tiles[p.smartBarLabel].on);
        assert.deepEqual((await preferences()).smartBar.allowedHosts, []);
      });

      await t_.test("Subtitles work on a page with a video", async () => {
        // Unavailable: pressing it does nothing.
        await pressTile(menu, p.subtitlesLabel);
        const video = await browser.open(url("/video"));
        await video.send("Page.bringToFront");
        await menuIs(
          (value) =>
            !value.tiles[p.subtitlesLabel].unavailable &&
            !value.tiles[p.subtitlesLabel].on &&
            value.tiles[p.subtitlesLabel].tooltip === p.subtitles,
        );
        await pressTile(menu, p.subtitlesLabel);
        await menuIs((value) => value.tiles[p.subtitlesLabel].on);
        // The video's own right-click item says it hides them now.
        await poll(
          async () =>
            (await subtitleTitle()) === t.pageTranslate.subtitles.menuHide,
        );
        await pressTile(menu, p.subtitlesLabel);
        await menuIs((value) => !value.tiles[p.subtitlesLabel].on);
        await poll(
          async () =>
            (await subtitleTitle()) === t.pageTranslate.subtitles.menu,
        );
      });

      await t_.test("not on pages that aren't web pages", async () => {
        await menu.send("Page.bringToFront");
        const view = await menuIs((value) => value.site === p.notWebPage);
        for (const tile of Object.values(view.tiles)) {
          assert.equal(tile.unavailable, true);
          assert.equal(tile.tooltip, p.notWebPageReason);
        }
      });

      await t_.test("Translate into picks the language", async () => {
        await clickElement(menu, ".toolbar-menu-translate-into button", {
          text: "French",
        });
        await clickElement(menu, ".ui-select-item", {
          text: "German",
          exact: true,
        });
        await poll(
          async () =>
            (await preferences()).pageTranslate.targetLanguage === "de",
        );
        await poll(() =>
          menu
            .call(
              () =>
                document.querySelector(".toolbar-menu-translate-into")
                  .textContent,
            )
            .then((text) => text === "Translate into: German"),
        );
      });

      await t_.test("Open side panel opens the panel", async () => {
        const panelUrl = extensionUrl("sidepanel.html");
        assert.equal(await isOpen(panelUrl), false);
        // The language list has closed (it holds the pointer while open).
        await poll(() =>
          menu.call(() => !document.querySelector(".ui-select-content")),
        );
        await clickElement(menu, ".toolbar-menu-open-panel");
        await poll(() => isOpen(panelUrl));
      });
    } finally {
      await session.close();
    }
  },
);

// A key press is a user gesture only until the first await: the command
// must ask for the panel at once, in the window of the tab it came from.
// (CDP key events don't reach the browser's shortcuts, and a dispatched
// command carries no gesture, so the test watches the call itself.)
test(
  "the side panel's shortcut opens the panel at once",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startExtension();
    const { browser } = session;
    try {
      const page = await browser.open("about:blank");
      await page.send("Page.bringToFront");
      const worker = await session.worker();
      const { calls, windowId } = await worker.call(async (command) => {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        const open = chrome.sidePanel.open;
        const calls = [];
        chrome.sidePanel.open = async (options) => {
          calls.push(options);
        };
        try {
          chrome.commands.onCommand.dispatch(command, tab);
          // Read before anything else runs.
          return { calls: [...calls], windowId: tab.windowId };
        } finally {
          chrome.sidePanel.open = open;
        }
      }, SIDE_PANEL_COMMAND);
      assert.deepEqual(calls, [{ windowId }]);
    } finally {
      await session.close();
    }
  },
);
