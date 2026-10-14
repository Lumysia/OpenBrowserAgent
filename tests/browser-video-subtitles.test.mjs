import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { SUBTITLE_WINDOW } from "../src/shared/video-subtitles/schedule.ts";
import {
  BROWSER_TEST_TIMEOUT,
  contentScriptsRegistered,
} from "./browser-harness.mjs";
import { click, elementCenter } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import { fixtureTranslator } from "./page-translate-fixture.mjs";
import { inShadowRoot } from "./shadow-roots.mjs";
import {
  isLayerRoot,
  lineAt,
  pointAtVideo,
  seek,
  shownLine,
  startSubtitles,
  subtitles,
  videoButton,
} from "./video-subtitles-fixture.mjs";

// Translated video subtitles with the AI engine, on each kind of player:
// the original line on top, its translation below, in our own layer.
test(
  "translated video subtitles",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const batches = [];
    const prompts = [];
    const session = await startSubtitles({
      answer: fixtureTranslator(batches, prompts),
    });
    const { browser, url, clickMenuItem, options, fixture } = session;
    try {
      await contentScriptsRegistered(options);

      await t.test(
        "a <track>: from the menu, near the playhead first",
        async () => {
          const pageUrl = url("/track");
          const page = await browser.open(pageUrl);
          await seek(page, 31);
          await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl, {
            srcUrl: url("/blank.webm"),
            mediaType: "video",
          });
          assert.deepEqual(await shownLine(page, lineAt(30)), {
            original: lineAt(30),
            translation: `FR: ${lineAt(30)}`,
          });
          // The browser draws nothing itself while ours shows.
          assert.equal(
            await page.call(
              () => document.getElementById("video").textTracks[0].mode,
            ),
            "hidden",
          );
          // Bounded lookahead: nothing beyond the window was sent.
          const sent = batches.flat();
          const limit = 31 + SUBTITLE_WINDOW.aheadSeconds;
          assert.ok(sent.includes(lineAt(30)));
          assert.ok(
            !sent.some((text) => Number(/(\d+)/.exec(text)?.[1]) > limit),
            `sent beyond ${limit} s: ${sent.join(" | ")}`,
          );
          // The model reads them as subtitles of this video, with the lines
          // said before.
          const prompt = prompts.find((item) =>
            item.includes(`[[1]]\n${lineAt(30)}`),
          );
          assert.match(prompt, /^Video title: A track video$/m);
          assert.match(
            prompt,
            /^Said just before the items: Line at 20 seconds\. Line at 25 seconds\.$/m,
          );

          // A seek far ahead: the lines there are translated then.
          await seek(page, 171);
          assert.equal(
            (await shownLine(page, lineAt(170))).translation,
            `FR: ${lineAt(170)}`,
          );

          // The menu again turns them off and gives the track back.
          await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl, {
            srcUrl: url("/blank.webm"),
          });
          await poll(async () => (await subtitles(page)) === null);
          assert.equal(
            await page.call(
              () => document.getElementById("video").textTracks[0].mode,
            ),
            "showing",
          );
          await page.send("Page.close");
        },
      );

      await t.test(
        "cues added over time, from the video's button",
        async () => {
          const page = await browser.open(url("/streamed"));
          await pointAtVideo(page);
          const button = await poll(() => videoButton(page));
          assert.equal(button.label, "Translate subtitles");
          assert.equal(button.pressed, false);
          await click(page, button);
          // Cues the player adds later are translated when the playhead gets
          // there.
          await poll(() =>
            page.call(
              () =>
                document.getElementById("video").textTracks[0].cues.length >=
                30,
            ),
          );
          await seek(page, 126);
          assert.equal(
            (await shownLine(page, "Streamed line 25.")).translation,
            "FR: Streamed line 25.",
          );
          await pointAtVideo(page);
          const pressed = await poll(async () => {
            const value = await videoButton(page);
            return value?.pressed ? value : null;
          });
          assert.equal(pressed.label, "Hide translated subtitles");
          await click(page, pressed);
          await poll(async () => (await subtitles(page)) === null);
          await poll(async () => (await videoButton(page))?.pressed === false);
          // Turned off in the settings, it goes from the open page at once.
          await session.setPreferences({ videoButton: false });
          await pointAtVideo(page);
          await poll(async () => (await videoButton(page)) === null);
          await session.setPreferences({ videoButton: true });
          await page.send("Page.close");
        },
      );

      await t.test(
        "captions drawn as page text, from Translate this page",
        async () => {
          const pageUrl = url("/drawn");
          const page = await browser.open(pageUrl);
          await poll(() =>
            page.call(() => !document.getElementById("video").paused),
          );
          await clickMenuItem(CONTEXT_MENU_ID.translatePage, pageUrl);
          const lines = [
            "The river was high that spring.",
            "We waited two days to cross.",
            "Then the water went down.",
          ];
          const shown = await poll(async () => {
            const value = await subtitles(page);
            return value && lines.includes(value.original) && value.translation
              ? value
              : null;
          });
          assert.equal(shown.translation, `FR: ${shown.original}`);
          // The player's own line is hidden, its controls aren't.
          assert.equal(
            await page.call(
              () =>
                getComputedStyle(document.getElementById("captions")).opacity,
            ),
            "0",
          );
          assert.equal(
            await page.call(
              () =>
                getComputedStyle(document.getElementById("pause").parentElement)
                  .opacity,
            ),
            "1",
          );
          // In the player's fullscreen the layer goes along.
          await page.send("Runtime.evaluate", {
            expression: "document.getElementById('player').requestFullscreen()",
            userGesture: true,
            awaitPromise: true,
          });
          assert.equal(
            await poll(() =>
              inShadowRoot(
                page,
                isLayerRoot,
                (root) =>
                  document.fullscreenElement && root?.host.parentElement?.id,
              ),
            ),
            "player",
          );
          assert.ok(await subtitles(page));
          await page.call(() => document.exitFullscreen());
          // "Show original" takes the subtitles away and gives the line back.
          await clickMenuItem(CONTEXT_MENU_ID.translatePage, pageUrl);
          await poll(async () => (await subtitles(page)) === null);
          await poll(() =>
            page.call(
              () =>
                getComputedStyle(document.getElementById("captions"))
                  .opacity === "1",
            ),
          );
          await page.send("Page.close");
        },
      );

      await t.test(
        "a caption file the player loads after starting",
        async () => {
          const page = await browser.open(url("/stub-later"));
          await seek(page, 46);
          await pointAtVideo(page);
          await click(page, await poll(() => videoButton(page)));
          // Nothing to read yet. Once the observer is in the page, the
          // player's CC button loads its file, and that copy is read: it
          // isn't fetched again.
          await poll(() =>
            page.call(
              () =>
                !String(XMLHttpRequest.prototype.send).includes("native code"),
            ),
          );
          await click(page, await elementCenter(page, "#cc"));
          await poll(() => page.call(() => window.loaded === 40));
          assert.equal(
            (await shownLine(page, "Stub line at 45 seconds.")).translation,
            "FR: Stub line at 45 seconds.",
          );
          assert.equal(
            fixture.requests.filter((request) =>
              request.url.startsWith("/api/captions"),
            ).length,
            1,
          );
          await page.send("Page.close");
        },
      );

      await t.test("a caption file the player loaded before", async () => {
        const pageUrl = url("/stub-earlier");
        const page = await browser.open(pageUrl);
        await poll(() => page.call(() => window.loaded === 40));
        await seek(page, 61);
        await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl);
        assert.equal(
          (await shownLine(page, "Stub line at 60 seconds.")).translation,
          "FR: Stub line at 60 seconds.",
        );
        await page.send("Page.close");
      });
    } finally {
      await session.close();
    }
  },
);
