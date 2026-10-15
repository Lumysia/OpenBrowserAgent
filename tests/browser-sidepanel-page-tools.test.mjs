import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";

// The side panel's "This page" strip: the active page's switches.

const VIDEO_PAGE = `<!doctype html><html lang="en"><head><title>Video</title></head><body>
<video muted style="width:480px;height:270px;background:#000"></video>
</body></html>`;

// The strip's switches by label, with their state; null while it isn't shown.
function strip(panel) {
  return panel.call(() => {
    const root = document.querySelector(".page-tools-strip");
    if (!root) return null;
    return {
      open:
        root
          .querySelector(".page-tools-toggle")
          .getAttribute("aria-expanded") === "true",
      switches: Object.fromEntries(
        [...root.querySelectorAll(".ui-toggle-group-item")].map((item) => [
          item.getAttribute("aria-label"),
          { on: item.dataset.state === "on", disabled: item.disabled },
        ]),
      ),
    };
  });
}

const press = (panel, selector) =>
  panel.call((selector) => document.querySelector(selector).click(), selector);

test(
  "the side panel's This page strip",
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
    const { browser, url, options, extensionUrl } = session;
    const preferences = () =>
      options.call(
        async (key) => (await chrome.storage.local.get(key))[key],
        STORAGE_KEYS.preferences,
      );
    try {
      // The panel in a tab of the same window: the active tab is the page.
      const panel = await browser.open(extensionUrl("sidepanel.html"));
      const page = await browser.open(url("/article"));
      await page.send("Page.bringToFront");
      const stripIs = (check) =>
        poll(async () => {
          const value = await strip(panel);
          return value && check(value) ? value : null;
        });

      await t.test("it shows the page's switches", async () => {
        const shown = await stripIs((value) => value.open);
        assert.deepEqual(shown.switches, {
          "Translate this page": { on: false, disabled: false },
          "Translate button on this site": { on: true, disabled: false },
          "Smart bar on this site": { on: false, disabled: false },
        });
      });

      await t.test(
        "the switches change the page and the site lists",
        async () => {
          await press(panel, '[aria-label="Smart bar on this site"]');
          await stripIs((value) => value.switches["Smart bar on this site"].on);
          assert.deepEqual((await preferences()).smartBar.allowedHosts, [
            "127.0.0.1",
          ]);
          await press(panel, '[aria-label="Translate button on this site"]');
          await stripIs(
            (value) => !value.switches["Translate button on this site"].on,
          );
          assert.deepEqual(
            (await preferences()).pageTranslate.pageButtonHiddenHosts,
            ["127.0.0.1"],
          );
          await press(panel, '[aria-label="Translate this page"]');
          await poll(() => translationIn(page, "#intro"));
          await stripIs((value) => value.switches["Show original"]?.on);
          await press(panel, '[aria-label="Show original"]');
          await poll(async () => !(await translationIn(page, "#intro")));
          await stripIs((value) => value.switches["Translate this page"]);
        },
      );

      await t.test(
        "subtitles show with a video; the strip collapses",
        async () => {
          const video = await browser.open(url("/video"));
          await video.send("Page.bringToFront");
          await stripIs(
            (value) => value.switches["Translated subtitles for this video"],
          );
          await press(panel, ".page-tools-toggle");
          const closed = await stripIs((value) => !value.open);
          assert.deepEqual(closed.switches, {});
        },
      );

      await t.test("not on pages that aren't web pages", async () => {
        await press(panel, ".page-tools-toggle");
        await panel.send("Page.bringToFront");
        await poll(async () => (await strip(panel)) === null);
      });
    } finally {
      await session.close();
    }
  },
);
