import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { HIDDEN_ATTRIBUTE } from "../src/video-subtitles/player.ts";
import { PAGE_SCRIPT } from "../src/shared/page-scripts.ts";
import {
  BROWSER_TEST_TIMEOUT,
  contentScriptsRegistered,
} from "./browser-harness.mjs";
import { elementCenter, hover } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import { fixtureTranslator } from "./page-translate-fixture.mjs";
import { inShadowRoot } from "./shadow-roots.mjs";
import {
  isLayerRoot,
  seek,
  startSubtitles,
  subtitles,
} from "./video-subtitles-fixture.mjs";
import {
  CHAPTER_TITLE,
  ROLLING_WORDS,
  rollingLine,
  TIP_LABEL,
  WORD_SECONDS,
} from "./video-subtitles-rolling-fixture.mjs";

// Whether the element `selector` shows: neither it nor a box around it
// is hidden or transparent.
const shows = (page, selector) =>
  page.call((selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    for (let item = element; item; item = item.parentElement) {
      const style = getComputedStyle(item);
      if (
        style.opacity === "0" ||
        style.visibility === "hidden" ||
        style.display === "none"
      )
        return false;
    }
    return true;
  }, selector);

const LINE = "#cc-area > div > span:last-child";

// Our layer's original line: the words that show, and its width.
const originalShown = (page) =>
  inShadowRoot(page, isLayerRoot, (root) => {
    const original = root?.querySelector(".original");
    if (!original || root.querySelector(".layer").hidden) return null;
    return {
      said: [...original.children]
        .filter((word) => getComputedStyle(word).visibility === "visible")
        .map((word) => word.textContent)
        .join("")
        .trim(),
      width: original.getBoundingClientRect().width,
      translation: root.querySelector(".translation").textContent,
    };
  });

// The cue of our own text track in the video (shown in its fullscreen).
const ownCue = (page) =>
  page.call(() => {
    const track = [...document.getElementById("video").textTracks].find(
      (item) => item.mode === "showing",
    );
    const cue = track?.activeCues?.[0];
    if (!cue) return null;
    window.firstCue ??= cue;
    return { text: cue.text, same: cue === window.firstCue };
  });

// The player's own captions don't show under ours: while our layer shows
// the lines, the player's are hidden, and they come back when ours stop.
test(
  "translated video subtitles: the player's own captions",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const session = await startSubtitles({ answer: fixtureTranslator() });
    const { browser, url, clickMenuItem } = session;
    try {
      await t.test(
        "a text track the browser shows: hidden while ours show",
        async () => {
          const pageUrl = url("/streamed");
          const page = await browser.open(pageUrl);
          const mode = () =>
            page.call(
              () => document.getElementById("video").textTracks[0].mode,
            );
          assert.equal(await mode(), "showing");
          await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl);
          await poll(async () => (await subtitles(page))?.translation);
          assert.equal(await mode(), "hidden");
          await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl);
          await poll(async () => (await subtitles(page)) === null);
          assert.equal(await mode(), "showing");
          await page.send("Page.close");
        },
      );

      await t.test("always on", async () => {
        await session.setPreferences({ videoSubtitles: true });
        await contentScriptsRegistered(
          session.options,
          PAGE_SCRIPT.videoSubtitles,
        );
      });

      await t.test(
        "always on: drawn by a player from its caption file, hidden while ours show",
        async () => {
          const pageUrl = url("/rolling");
          const page = await browser.open(pageUrl);
          await poll(() => page.call(() => window.loaded === 40));
          await seek(page, 1);
          await page.call(() => document.getElementById("video").play());
          await poll(() =>
            page.call(
              (line) => document.querySelector(line)?.textContent,
              LINE,
            ),
          );

          const shown = await poll(async () => {
            const value = await subtitles(page);
            return value?.translation ? value : null;
          });
          assert.match(
            shown.original,
            /^Rolling words at \d+ seconds said slowly\.$/,
          );
          await poll(async () => (await shows(page, LINE)) === false);
          // The next line, in a box the player makes anew: hidden as well.
          await page.call(() => {
            window.firstBox = document.querySelector("#cc-area > div");
          });
          await poll(() =>
            page.call(() => {
              const box = document.querySelector("#cc-area > div");
              return box && box !== window.firstBox && box.textContent.trim();
            }),
          );
          assert.equal(await shows(page, LINE), false);
          // Other text over the video shows: a chapter title, a tooltip.
          await hover(page, await elementCenter(page, "#settings"));
          assert.equal(
            await page.call(() => document.getElementById("tip").textContent),
            TIP_LABEL,
          );
          assert.equal(await shows(page, "#tip"), true);
          assert.equal(await shows(page, "#chapter"), true);
          assert.equal(
            await page.call(
              () => document.getElementById("chapter").textContent,
            ),
            CHAPTER_TITLE,
          );

          // Turned off from the menu: the player's captions are back, nothing of ours left.
          await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl);
          await poll(async () => (await subtitles(page)) === null);
          await poll(async () => (await shows(page, LINE)) === true);
          assert.equal(
            await page.call(
              (name) => document.querySelectorAll(`[${name}]`).length,
              HIDDEN_ATTRIBUTE,
            ),
            0,
          );
          await page.send("Page.close");
        },
      );

      await t.test(
        "always on: a line with timed words shows them as they are said",
        async () => {
          const pageUrl = url("/rolling");
          const page = await browser.open(pageUrl);
          await poll(() => page.call(() => window.loaded === 40));
          const line = rollingLine(30);
          const saidBy = (count) => ROLLING_WORDS(30).slice(0, count).join(" ");
          // Halfway through the line: three words said of seven.
          await seek(page, 30 + 2 * WORD_SECONDS + 0.2);
          const half = await poll(async () => {
            const value = await originalShown(page);
            return value?.translation ? value : null;
          });
          assert.equal(half.said, saidBy(3));
          // The translation shows whole.
          assert.equal(half.translation, `FR: ${line}`);
          // The words not said yet keep their place.
          await seek(page, 30 + 6 * WORD_SECONDS + 0.2);
          const whole = await poll(async () => {
            const value = await originalShown(page);
            return value?.said === line ? value : null;
          });
          assert.equal(whole.width, half.width);

          // In the video's own fullscreen, its text track shows the words
          // said, in the same cue as they come.
          await seek(page, 30 + WORD_SECONDS + 0.2);
          await page.send("Runtime.evaluate", {
            expression: "document.getElementById('video').requestFullscreen()",
            userGesture: true,
            awaitPromise: true,
          });
          const first = await poll(async () => {
            const cue = await ownCue(page);
            return cue?.text.startsWith(saidBy(2)) ? cue : null;
          });
          assert.equal(first.text, `${saidBy(2)}\nFR: ${line}`);
          assert.ok(first.same);
          await seek(page, 30 + 4 * WORD_SECONDS + 0.2);
          const later = await poll(async () => {
            const cue = await ownCue(page);
            return cue?.text.startsWith(saidBy(5)) ? cue : null;
          });
          assert.equal(later.text, `${saidBy(5)}\nFR: ${line}`);
          assert.ok(later.same);
          await page.call(() => document.exitFullscreen());
          await page.send("Page.close");
        },
      );
    } finally {
      await session.close();
    }
  },
);
