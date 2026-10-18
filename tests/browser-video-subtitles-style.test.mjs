import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { OPTIONS_HASH } from "../src/shared/config.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { pageTranslateEnUS } from "../src/shared/locales/page-translate/en-US.ts";
import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_COLOR_PRESETS,
  SUBTITLE_FONTS,
  subtitleBox,
} from "../src/shared/video-subtitles/style.ts";
import { BROWSER_TEST_TIMEOUT, unchangedFor } from "./browser-harness.mjs";
import { clickElement, pressKey, typeText } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import { fixtureTranslator } from "./page-translate-fixture.mjs";
import { inShadowRoot } from "./shadow-roots.mjs";
import {
  FRAME_SECONDS,
  isLayerRoot,
  lineAt,
  seek,
  shownLine,
  startSubtitles,
} from "./video-subtitles-fixture.mjs";

// The computed look of the subtitle layer's lines, in the page or in the
// Settings preview (`root`: a shadow root holding a `.layer`).
function lineLook(root) {
  if (!root) return null;
  const look = (element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      background: style.backgroundColor,
      shadow: style.textShadow,
      color: style.color,
      font: style.fontFamily,
      size: parseFloat(style.fontSize),
    };
  };
  return {
    original: look(root.querySelector(".original")),
    translation: look(root.querySelector(".translation")),
  };
}

const pageLook = (page) => inShadowRoot(page, isLayerRoot, lineLook);
const previewLook = (options) =>
  options.call(
    `() => (${lineLook})(document.querySelector(".subtitle-preview")?.shadowRoot)`,
  );

// A colour as getComputedStyle gives it (an opaque one without its alpha).
function computed(color) {
  const hex = /^#(..)(..)(..)$/.exec(color);
  if (hex)
    return `rgb(${hex
      .slice(1)
      .map((part) => parseInt(part, 16))
      .join(", ")})`;
  const [, r, g, b, a] = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(color);
  return a === "1" ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

const labels = pageTranslateEnUS.subtitles.style;

// One preset of a group in the Settings section, by their names.
const choose = (options, group, item) =>
  clickElement(options, `[aria-label="${group}"] button`, {
    text: item,
    exact: true,
  });

// A colour field of the Settings section, by its row's title.
const colorField = (title) => `[role="group"][aria-label="${title}"]`;
const hexField = (title) =>
  `${colorField(title)} input[aria-label="${labels.hexColor}"]`;

// Types `text` over the hex code of the field `title`, then Enter.
async function enterHex(options, title, text) {
  await options.call((selector) => {
    const input = document.querySelector(selector);
    input.focus();
    input.select();
  }, hexField(title));
  await typeText(options, text);
  await pressKey(options, "Enter");
}

test(
  "translated video subtitles: their style",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const session = await startSubtitles({ answer: fixtureTranslator() });
    const { browser, url, clickMenuItem, options, extensionUrl } = session;
    const storedStyle = () =>
      options.call(
        async (key) =>
          (await chrome.storage.local.get(key))[key].pageTranslate
            .subtitleStyle,
        STORAGE_KEYS.preferences,
      );
    try {
      const pageUrl = url("/frames");
      const page = await browser.open(pageUrl);
      await seek(page, FRAME_SECONDS.bright);
      await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl);
      await shownLine(page, lineAt(0));

      await t.test(
        "the default: a box at 30%, white lines with an outline",
        async () => {
          const look = await pageLook(page);
          const light = computed(subtitleBox(30));
          assert.equal(look.original.background, light);
          assert.equal(look.translation.background, light);
          assert.equal(look.translation.color, computed("#ffffff"));
          assert.equal(look.original.color, computed("#ffffff"));
          assert.match(look.translation.shadow, /0px 0px 2px/);
          assert.equal(look.translation.font, SUBTITLE_FONTS.system);
          assert.equal(look.original.display, "block");
        },
      );

      let base;
      await t.test(
        "changed in Settings: the preview and the video's lines follow at once",
        async () => {
          base = (await pageLook(page)).translation.size;
          await options.send("Page.navigate", {
            url: extensionUrl(`options.html${OPTIONS_HASH.pageTranslate}`),
          });
          await options.send("Page.bringToFront");
          await poll(() => previewLook(options));
          assert.deepEqual(
            (await previewLook(options)).translation.background,
            computed(subtitleBox(30)),
          );
          // The opacity slider, by keyboard: all the way up.
          await clickElement(
            options,
            `[role="slider"][aria-label="${labels.background}"]`,
          );
          await pressKey(options, "End");
          await clickElement(
            options,
            `${colorField(labels.translationColor)} button[aria-label="${labels.colors.cyan}"]`,
          );
          await choose(options, labels.font, labels.fonts.serif);
          await poll(async () => (await storedStyle())?.font === "serif");
          assert.deepEqual(await storedStyle(), {
            ...DEFAULT_SUBTITLE_STYLE,
            backgroundOpacity: 100,
            translationColor: SUBTITLE_COLOR_PRESETS.cyan,
            font: "serif",
          });
          assert.equal(
            await options.call(
              (selector) => document.querySelector(selector).value,
              hexField(labels.translationColor),
            ),
            SUBTITLE_COLOR_PRESETS.cyan,
          );
          const expected = {
            background: computed(subtitleBox(100)),
            color: computed(SUBTITLE_COLOR_PRESETS.cyan),
            font: SUBTITLE_FONTS.serif,
          };
          const matches = (look) =>
            look &&
            look.translation.background === expected.background &&
            look.translation.color === expected.color &&
            look.translation.font === expected.font;
          await poll(async () => matches(await previewLook(options)));
          // The page that already shows subtitles changes without a reload.
          await poll(async () => matches(await pageLook(page)));

          // All the way down: no box, the text outlined instead.
          await clickElement(
            options,
            `[role="slider"][aria-label="${labels.background}"]`,
          );
          await pressKey(options, "Home");
          await poll(async () => {
            const look = await pageLook(page);
            return (
              look.translation.background === "rgba(0, 0, 0, 0)" &&
              look.translation.shadow.includes("0px 0px 2px")
            );
          });
          assert.equal((await storedStyle()).backgroundOpacity, 0);
        },
      );

      await t.test(
        "a typed hex colour: saved as #rrggbb, used at once, kept on reload; an invalid one isn't saved",
        async () => {
          await enterHex(options, labels.originalColor, "FC0");
          await poll(
            async () => (await storedStyle())?.originalColor === "#ffcc00",
          );
          const yellow = computed("#ffcc00");
          await poll(
            async () => (await previewLook(options))?.original.color === yellow,
          );
          await poll(
            async () => (await pageLook(page))?.original.color === yellow,
          );

          await enterHex(options, labels.originalColor, "#12345z");
          assert.equal(
            await options.call(
              (selector) =>
                document.querySelector(selector).getAttribute("aria-invalid"),
              hexField(labels.originalColor),
            ),
            "true",
          );
          assert.ok(
            await options.call(
              (text) => document.body.textContent.includes(text),
              labels.invalidColor,
            ),
          );
          // Leaving the field doesn't save it either.
          await options.call(() => document.activeElement.blur());
          assert.equal(
            await unchangedFor(async () => (await storedStyle()).originalColor),
            "#ffcc00",
          );
          assert.equal((await previewLook(options)).original.color, yellow);

          await options.send("Page.reload");
          await poll(() =>
            options.call(
              (selector) => document.querySelector(selector)?.value,
              hexField(labels.originalColor),
            ),
          ).then((value) => assert.equal(value, "#ffcc00"));
          await poll(
            async () => (await previewLook(options))?.original.color === yellow,
          );
        },
      );

      await t.test(
        "the size scale and the original line, live on a dark frame",
        async () => {
          await seek(page, FRAME_SECONDS.dark);
          await shownLine(page, lineAt(10));
          await session.setPreferences({
            subtitleStyle: {
              ...(await storedStyle()),
              scale: 150,
              showOriginal: false,
            },
          });
          await poll(async () => {
            const look = await pageLook(page);
            return (
              look.original.display === "none" &&
              Math.abs(look.translation.size - base * 1.5) < 0.5
            );
          });
        },
      );
      // No Page.close here: the tab is in the background with its video
      // playing, and Page.close on it timed out on busy runners. Closing
      // the session closes it with the browser.
    } finally {
      await session.close();
    }
  },
);
