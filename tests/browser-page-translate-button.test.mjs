import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_SCRIPT } from "../src/shared/page-scripts.ts";
import { DEFAULT_PAGE_BUTTON_POSITION } from "../src/shared/page-translate/button.ts";
import { PAGE_TRANSLATE_COMMAND } from "../src/shared/page-translate/protocol.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import {
  BROWSER_TEST_TIMEOUT,
  contentScriptsRegistered,
  unchangedFor,
} from "./browser-harness.mjs";
import { click, movePointer } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";
import { hasClass, inShadowRoot } from "./shadow-roots.mjs";

// The button in the page's closed shadow root: where it is and what it says,
// once it has stopped moving; null while it isn't shown (or still moves).
function pageButton(page) {
  return inShadowRoot(
    page,
    (root) =>
      root.shadowRootType === "closed" &&
      root.children?.some((child) => hasClass(child, "page-button-theme")),
    (root) => {
      const dock = root?.querySelector(".page-button-dock");
      if (!dock || root.getAnimations().length) return null;
      const center = (element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      };
      const button = root.querySelector(".page-button");
      const close = root.querySelector(".page-button-close");
      const items = [...root.querySelectorAll(".page-button-menu-item")];
      return {
        ...center(button),
        edge: dock.dataset.edge,
        label: button.getAttribute("aria-label"),
        translated: button.hasAttribute("data-translated"),
        close: center(close),
        menu: root.querySelector(".page-button-menu").hidden
          ? null
          : items.map((item) => ({ text: item.textContent, ...center(item) })),
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
        },
      };
    },
  );
}

// Points at the visible half of the tucked button, near the edge (where a
// pointer pushed against the side of the screen rests, past where the button
// stops once out), so it slides out, and returns it once it is out and at
// rest.
async function pointAt(page) {
  const { viewport } = await poll(() => pageButton(page));
  await movePointer(page, { x: viewport.width / 2, y: viewport.height / 2 });
  const tucked = await poll(() => pageButton(page));
  const inward = {
    right: { x: -6, y: 0 },
    left: { x: 6, y: 0 },
    top: { x: 0, y: 6 },
    bottom: { x: 0, y: -6 },
  }[tucked.edge];
  await movePointer(page, { x: tucked.x + inward.x, y: tucked.y + inward.y });
  return poll(async () => {
    const button = await pageButton(page);
    return button && (button.x !== tucked.x || button.y !== tucked.y)
      ? button
      : null;
  });
}

async function pressButton(page) {
  await click(page, await pointAt(page));
}

const isLabel = (page, label) =>
  poll(async () => (await pageButton(page))?.label === label);

const translationCount = (page) =>
  page.call(() => document.querySelectorAll("oba-translation").length);

test(
  "the translate button on pages and the shortcut",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const session = await startPageTranslate({
      pages: {
        "/article": articlePage({ paragraphs: 5 }),
        "/other": articlePage({ paragraphs: 3 }),
        "/unmarked": articlePage({ paragraphs: 3 }).replace(' lang="en"', ""),
      },
      answer: fixtureTranslator(),
      // The English pages are in another language than the target.
      preferences: { pageTranslate: { targetLanguage: "fr" } },
    });
    const { browser, url, options, clickMenu, worker } = session;
    const shortcut = (pageUrl) =>
      worker.call(
        async ({ command, pageUrl }) => {
          const [tab] = await chrome.tabs.query({ url: pageUrl });
          chrome.commands.onCommand.dispatch(command, tab);
        },
        { command: PAGE_TRANSLATE_COMMAND, pageUrl },
      );
    try {
      await contentScriptsRegistered(options, PAGE_SCRIPT.pageTranslateButton);
      const page = await browser.open(url("/article"));

      await t.test("it shows on the right edge, two thirds down", async () => {
        const button = await poll(() => pageButton(page));
        assert.equal(button.edge, "right");
        assert.equal(button.label, "Translate this page");
        // Half tucked in: its middle on the edge.
        assert.ok(Math.abs(button.x - button.viewport.width) <= 1);
        assert.ok(
          Math.abs(
            button.y -
              button.viewport.height * DEFAULT_PAGE_BUTTON_POSITION.along,
          ) <= 1,
        );
      });

      await t.test(
        "a click translates, a second shows the original",
        async () => {
          await pressButton(page);
          await poll(() => translationIn(page, "#intro"));
          await isLabel(page, "Show original");
          assert.equal((await pageButton(page)).translated, true);
          await pressButton(page);
          await poll(async () => (await translationCount(page)) === 0);
          await isLabel(page, "Translate this page");
        },
      );

      await t.test("it follows the menu", async () => {
        await clickMenu(url("/article"));
        await isLabel(page, "Show original");
        await clickMenu(url("/article"));
        await isLabel(page, "Translate this page");
      });

      await t.test(
        "a drag lets go onto the nearest edge, kept on the next page",
        async () => {
          const start = await pointAt(page);
          const { width, height } = start.viewport;
          const end = { x: width / 2, y: height * 0.2 };
          const mouse = (type, point, buttons) =>
            page.send("Input.dispatchMouseEvent", {
              type,
              ...point,
              button: "left",
              buttons,
              clickCount: 1,
            });
          await mouse("mousePressed", start, 1);
          for (let step = 1; step <= 5; step++)
            await mouse(
              "mouseMoved",
              {
                x: start.x + ((end.x - start.x) * step) / 5,
                y: start.y + ((end.y - start.y) * step) / 5,
              },
              1,
            );
          await mouse("mouseReleased", end, 0);
          // Nearer the top than the sides: on the top edge, in the middle.
          await movePointer(page, { x: 1, y: height - 1 });
          const dropped = await poll(async () => {
            const button = await pageButton(page);
            return button?.edge === "top" && button.y <= 1 ? button : null;
          });
          assert.ok(Math.abs(dropped.x - width / 2) <= 1);
          // A drag isn't a click.
          assert.equal(await unchangedFor(() => translationCount(page)), 0);
          assert.deepEqual(
            await poll(() =>
              options.call(
                async (key) => (await chrome.storage.local.get(key))[key],
                STORAGE_KEYS.pageTranslateButtonPosition,
              ),
            ),
            { edge: "top", along: 0.5 },
          );
          const other = await browser.open(url("/other"));
          const there = await poll(() => pageButton(other));
          assert.equal(there.edge, "top");
          assert.ok(Math.abs(there.x - there.viewport.width / 2) <= 1);
          await other.send("Page.close");
        },
      );

      await t.test("the shortcut toggles, unless it is off", async () => {
        await shortcut(url("/article"));
        await poll(() => translationIn(page, "#intro"));
        await isLabel(page, "Show original");
        await shortcut(url("/article"));
        await poll(async () => (await translationCount(page)) === 0);
        await session.setPreferences({ shortcut: false });
        await shortcut(url("/article"));
        assert.equal(await unchangedFor(() => translationCount(page)), 0);
        await session.setPreferences({ shortcut: true });
      });

      await t.test(
        "it stays away from pages in the target language",
        async () => {
          await session.setPreferences({ targetLanguage: "en" });
          await poll(async () => (await pageButton(page)) === null);
          // The shortcut still translates; the button comes back to show
          // the original, and goes with it.
          await shortcut(url("/article"));
          await poll(() => translationIn(page, "#intro"));
          await isLabel(page, "Show original");
          await shortcut(url("/article"));
          await poll(async () => (await translationCount(page)) === 0);
          await poll(async () => (await pageButton(page)) === null);
          // A page that doesn't say its language gets it (the test browser
          // has no on-device detector ready to read the text).
          const unmarked = await browser.open(url("/unmarked"));
          await poll(() => pageButton(unmarked));
          await unmarked.send("Page.close");
          await session.setPreferences({ targetLanguage: "fr" });
          await poll(() => pageButton(page));
        },
      );

      await t.test("hide on this site hides it there only", async () => {
        const button = await pointAt(page);
        await movePointer(page, button.close);
        await click(page, button.close);
        const menu = await poll(async () => (await pageButton(page))?.menu);
        assert.deepEqual(
          menu.map(({ text }) => text),
          ["Hide on 127.0.0.1", "Hide everywhere"],
        );
        await movePointer(page, menu[0]);
        await click(page, menu[0]);
        await poll(async () => (await pageButton(page)) === null);
        // Elsewhere it still shows.
        const elsewhere = await browser.open(url("/other", "localhost"));
        await poll(() => pageButton(elsewhere));
        // Not on the next page of the hidden site.
        const again = await browser.open(url("/other"));
        await poll(() => again.call(() => document.readyState === "complete"));
        assert.equal(await unchangedFor(() => pageButton(again)), null);
        await again.send("Page.close");

        // Off: unregistered, and gone from open pages.
        await session.setPreferences({ pageButton: false });
        await poll(async () => (await pageButton(elsewhere)) === null);
        await poll(() =>
          options.call(
            async (script) =>
              !(await chrome.scripting.getRegisteredContentScripts()).some(
                (registered) => registered.js?.includes(script),
              ),
            PAGE_SCRIPT.pageTranslateButton,
          ),
        );
        await elsewhere.send("Page.close");
      });
    } finally {
      await session.close();
    }
  },
);
