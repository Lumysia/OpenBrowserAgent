import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { POINTED_MS } from "../src/video-subtitles/sources/pointed-controls.ts";
import { BROWSER_TEST_TIMEOUT, unchangedFor } from "./browser-harness.mjs";
import { elementCenter, hover, movePointer } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import { fixtureTranslator } from "./page-translate-fixture.mjs";
import {
  CHAPTERS,
  CONTROL_LABELS,
  DRAWN_LINES,
  startSubtitles,
  subtitles,
} from "./video-subtitles-fixture.mjs";

// Points at each of the player's controls in turn, so its tooltip shows
// their names one after the other, staying `pauseMs` on each.
async function hoverControls(page, pauseMs = 0) {
  for (const [index] of CONTROL_LABELS.entries()) {
    await hover(page, await elementCenter(page, `#control-${index}`));
    await delay(pauseMs);
  }
}

// Goes along the seek bar, over each chapter.
async function hoverChapters(page) {
  for (const [index] of CHAPTERS.entries())
    await hover(page, await elementCenter(page, `#chapter-${index}`));
}

const tipOpacity = (page) =>
  page.call(() => getComputedStyle(document.getElementById("tip")).opacity);

// A player's tooltips show over its video and change as the pointer goes
// from control to control, like captions drawn as page text: never taken
// for them.
test(
  "translated video subtitles: player tooltips aren't captions",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const batches = [];
    const session = await startSubtitles({
      answer: fixtureTranslator(batches),
    });
    const { browser, url, clickMenuItem } = session;
    const sentLabel = () =>
      batches
        .flat()
        .some((line) =>
          [...CONTROL_LABELS, ...CHAPTERS].some((label) =>
            line.includes(label),
          ),
        );
    const start = async (path) => {
      const pageUrl = url(path);
      const page = await browser.open(pageUrl);
      await poll(() =>
        page.call(() => !document.getElementById("video").paused),
      );
      await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl);
      return page;
    };
    try {
      await t.test(
        "no captions: the tooltips of the controls pointed at are left alone",
        async () => {
          const page = await start("/tooltips");
          for (let round = 0; round < 3; round++) {
            await hoverControls(page);
            await hoverChapters(page);
          }
          assert.equal(await unchangedFor(() => subtitles(page), 1_000), null);
          assert.ok(!sentLabel());
          assert.equal(await tipOpacity(page), "1");

          // A tooltip taken for captions (it changed by itself first) is let
          // go once it shows the name of the control pointed at.
          await movePointer(page, { x: 1, y: 1 });
          await delay(POINTED_MS + 100);
          await page.call(() => window.showTip("Speed"));
          await page.call(() => window.showTip("Quality"));
          await poll(
            async () => (await subtitles(page))?.original === "Quality",
          );
          assert.equal(await tipOpacity(page), "0");
          await hover(page, await elementCenter(page, "#control-1"));
          await poll(async () => (await subtitles(page)) === null);
          assert.equal(await tipOpacity(page), "1");
          await hoverControls(page);
          assert.equal(await unchangedFor(() => subtitles(page), 1_000), null);
          await page.send("Page.close");
        },
      );

      await t.test(
        "captions drawn as page text: translated while controls are pointed at",
        async () => {
          const page = await start("/tooltips-captions");
          // From control to control, as a viewer looking for one does.
          let hovering = true;
          const hovered = (async () => {
            while (hovering) await hoverControls(page, 800);
          })();
          try {
            const shown = await poll(async () => {
              const value = await subtitles(page);
              return value &&
                DRAWN_LINES.includes(value.original) &&
                value.translation
                ? value
                : null;
            });
            assert.equal(shown.translation, `FR: ${shown.original}`);
            // Still the captions after more pointing.
            await hoverControls(page);
            const now = await subtitles(page);
            assert.ok(now && DRAWN_LINES.includes(now.original));
          } finally {
            hovering = false;
            await hovered;
          }
          assert.ok(!sentLabel());
          assert.equal(await tipOpacity(page), "1");
          await page.send("Page.close");
        },
      );
    } finally {
      await session.close();
    }
  },
);
