import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTEXT_MENU_ID } from "../src/shared/context-menu.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import { fixtureTranslator } from "./page-translate-fixture.mjs";
import {
  seek,
  shownLine,
  startSubtitles,
  subtitles,
  STYLE,
  VIDEO_TAG,
} from "./video-subtitles-fixture.mjs";

// Subtitles translated by the browser's built-in translator on a page whose
// declared language is the site's interface language (Chinese here), not
// the video's. The translator is faked in the background: it records the
// language pair of each line it translates and, like Chrome's, has no pair
// from a language into itself. The language detector is missing, or unsure
// of every line, as on a profile that hasn't downloaded its model.

const ENGLISH = [
  "The river was high that spring.",
  "Okay.",
  "We waited two days to cross.",
  "Thank you.",
];
const CHINESE = ["今天的河水很高。", "好的。"];

const clock = (seconds) => `00:00:${String(seconds).padStart(2, "0")}.000`;
const vtt = (lines) =>
  [
    "WEBVTT",
    "",
    ...lines.flatMap((line, index) => [
      `${clock(index * 5)} --> ${clock(index * 5 + 4)}`,
      line,
      "",
    ]),
  ].join("\n");
const VTT = { "Content-Type": "text/vtt" };

const page = (title, track) =>
  `<!doctype html><html lang="zh-CN"><head><title>${title}</title>${STYLE}</head><body>
${VIDEO_TAG}>${track}</video>
</body></html>`;

// A player that draws its captions as page text, in a box it marks as
// English.
const drawn = `<!doctype html><html lang="zh-CN"><head><title>Drawn captions</title>${STYLE}</head><body>
<div id="player" style="position:relative;width:640px;height:360px">
${VIDEO_TAG.replace('style="', 'autoplay loop style="')}></video>
<div lang="en" style="position:absolute;left:0;right:0;bottom:40px;text-align:center"><span id="caption-line" style="background:#000;color:#fff"></span></div>
</div>
<script>
const video = document.getElementById("video");
const lines = ${JSON.stringify(ENGLISH)};
let index = 0;
setInterval(() => {
  if (!video.paused) document.getElementById("caption-line").textContent = lines[index++ % lines.length];
}, 700);
</script>
</body></html>`;

const PAGES = {
  "/english.vtt": { html: vtt(ENGLISH), headers: VTT },
  "/chinese.vtt": { html: vtt(CHINESE), headers: VTT },
  "/zh-ui/english": page(
    "English video",
    '<track kind="subtitles" srclang="en" label="English" src="/english.vtt" default>',
  ),
  "/zh-ui/unlabeled": page(
    "Unlabeled video",
    '<track kind="subtitles" label="CC" src="/english.vtt" default>',
  ),
  "/zh-ui/chinese": page(
    "Chinese video",
    '<track kind="subtitles" srclang="zh" label="中文" src="/chinese.vtt" default>',
  ),
  "/zh-ui/drawn": drawn,
};

// `detector`: "missing", or "unsure" (a right guess with low confidence).
// Translations saved before are cleared: each case translates its lines.
async function fakeTranslator(detector) {
  await new Promise((resolve, reject) => {
    const open = indexedDB.open("page-translations");
    // None saved yet: the database isn't made here.
    open.onupgradeneeded = () => open.transaction.abort();
    open.onerror = () => resolve();
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("translations", "readwrite");
      transaction.objectStore("translations").clear();
      transaction.oncomplete = () => resolve(database.close());
      transaction.onerror = () => reject(transaction.error);
    };
  });
  self.translated = [];
  if (detector === "missing") delete self.LanguageDetector;
  else
    self.LanguageDetector = {
      availability: async () => "available",
      create: async () => ({
        detect: async (text) => [
          {
            detectedLanguage: /[\u4e00-\u9fff]/.test(text) ? "zh" : "en",
            confidence: 0.3,
          },
        ],
      }),
    };
  const primary = (tag) => tag.split("-")[0];
  self.Translator = {
    availability: async ({ sourceLanguage, targetLanguage }) =>
      primary(sourceLanguage) === primary(targetLanguage)
        ? "unavailable"
        : "available",
    create: async ({ sourceLanguage, targetLanguage }) => ({
      translate: async (text) => {
        self.translated.push(`${sourceLanguage}>${targetLanguage}`);
        return `ZH: ${text}`;
      },
    }),
  };
}

test(
  "built-in translator: subtitles on a page in another language",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const session = await startSubtitles({
      answer: fixtureTranslator(),
      pages: PAGES,
      preferences: {
        pageTranslate: { engine: "browser", targetLanguage: "zh-CN" },
      },
    });
    const { browser, url, clickMenuItem, worker } = session;
    // Each case in a tab of its own address, which the menu click finds.
    let opened = 0;
    const open = async (path, detector) => {
      await worker.call(fakeTranslator, detector);
      const pageUrl = `${url(path)}?case=${++opened}`;
      const tab = await browser.open(pageUrl);
      await clickMenuItem(CONTEXT_MENU_ID.translateSubtitles, pageUrl, {
        srcUrl: url("/blank.webm"),
        mediaType: "video",
      });
      return tab;
    };
    // Each line's translation, from the start of the video.
    const shownLines = async (tab, lines) => {
      const shown = [];
      for (const [index, line] of lines.entries()) {
        await seek(tab, index * 5 + 1);
        shown.push((await shownLine(tab, line)).translation);
      }
      return shown;
    };
    const pairs = () => worker.call(() => [...new Set(self.translated)]);
    try {
      t.diagnostic(
        `the browser's own APIs in the background: ${await worker.call(
          async () => {
            const state = async (api, ...options) => {
              if (!api) return "missing";
              try {
                return await api.availability(...options);
              } catch (error) {
                return `${error}`;
              }
            };
            return `Translator ${await state(self.Translator, { sourceLanguage: "en", targetLanguage: "zh" })}, LanguageDetector ${await state(self.LanguageDetector)}`;
          },
        )}`,
      );
      for (const detector of ["missing", "unsure"])
        await t.test(
          `an English track, detector ${detector}: every line translated from English`,
          async () => {
            const tab = await open("/zh-ui/english", detector);
            assert.deepEqual(
              await shownLines(tab, ENGLISH),
              ENGLISH.map((line) => `ZH: ${line}`),
            );
            assert.deepEqual(await pairs(), ["en>zh"]);
            await tab.send("Page.close");
          },
        );

      await t.test(
        "a track in no declared language, detector missing: not echoed",
        async () => {
          const tab = await open("/zh-ui/unlabeled", "missing");
          // The built-in translator can't tell the source: the AI model
          // takes over.
          assert.deepEqual(
            await shownLines(tab, ENGLISH),
            ENGLISH.map((line) => `FR: ${line}`),
          );
          await tab.send("Page.close");
        },
      );

      await t.test(
        "a track in no declared language, detector unsure: its guess is taken",
        async () => {
          const tab = await open("/zh-ui/unlabeled", "unsure");
          assert.deepEqual(
            await shownLines(tab, ENGLISH),
            ENGLISH.map((line) => `ZH: ${line}`),
          );
          assert.deepEqual(await pairs(), ["en>zh"]);
          await tab.send("Page.close");
        },
      );

      await t.test(
        "captions drawn as page text in a box marked English",
        async () => {
          const tab = await open("/zh-ui/drawn", "missing");
          const shown = await poll(async () => {
            const value = await subtitles(tab);
            return value?.translation ? value : null;
          });
          assert.ok(ENGLISH.includes(shown.original));
          assert.equal(shown.translation, `ZH: ${shown.original}`);
          assert.deepEqual(await pairs(), ["en>zh"]);
          await tab.send("Page.close");
        },
      );

      await t.test("a Chinese track: kept as it is", async () => {
        const tab = await open("/zh-ui/chinese", "missing");
        assert.deepEqual(await shownLines(tab, CHINESE), CHINESE);
        assert.deepEqual(await pairs(), []);
        await tab.send("Page.close");
      });
    } finally {
      await session.close();
    }
  },
);
