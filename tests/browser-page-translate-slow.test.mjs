import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";
import { startPageTranslate } from "./page-translate-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// A model that answers late and in another script, as real ones do: the
// paragraphs on screen go first even when the page lists them last, they
// show as waiting until their translation comes, and then it shows.

const REPLY_MS = 1500;

// A small page (sent all at once) whose screen shows the last paragraphs
// of its source: a side panel with a heading in a one-item flex row and a
// sentence, after many paragraphs further down the screen.
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
body { margin: 0; font: 16px/1.5 sans-serif; }
main { display: flex; flex-direction: column-reverse; }
.far { margin: 700px 16px 0; }
#panel { padding: 16px; border: 1px solid #ccc; border-radius: 8px; margin: 16px; }
.row { display: flex; }
#picks { display: flex; margin: 0; font-size: 20px; font-weight: 400; }
</style></head><body><main>
${Array.from(
  { length: 24 },
  (_, i) =>
    `<p class="far" id="far${i + 1}">Paragraph ${i + 1} sits further down the screen and waits for its turn.</p>`,
).join("\n")}
<section id="panel"><div class="row"><h3 id="picks">Picks for you</h3></div>
<div id="sentence">Sign in for stories chosen for your interests.</div></section>
</main></body></html>`;

// Answers after a while with every word written in CJK, markers kept.
function slowCjkTranslator(requests) {
  return async (prompt, write) => {
    const messages = JSON.parse(prompt);
    const content = messages.find((m) => m.role === "user")?.content || "";
    if (!content.includes("[[end]]")) return write("标题");
    const items = [...content.matchAll(/^\[\[(\d+)\]\]\n(.*)$/gm)];
    requests.push(items.map(([, , text]) => text));
    await delay(REPLY_MS);
    for (const [, id, text] of items)
      write(`[[${id}]]\n${text.replace(/[A-Za-z]+/g, "译文")}\n`);
    write("[[end]]");
  };
}

// The translation shown for the element `selector`, whether it waits, and
// whether it is on screen.
function translationOf(browserPage, selector) {
  return browserPage.call((selector) => {
    const source = document.querySelector(selector);
    const element =
      source.querySelector("oba-translation") ??
      (source.nextElementSibling?.matches("oba-translation")
        ? source.nextElementSibling
        : null);
    if (!element) return undefined;
    const box = element.getBoundingClientRect();
    return {
      text: element.textContent,
      waiting: element.hasAttribute("data-oba-pending"),
      onScreen: box.height > 0 && box.top < innerHeight,
    };
  }, selector);
}

test(
  "page translation with a slow model writing CJK",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const requests = [];
    const session = await startPageTranslate({
      pages: { "/slow": page },
      answer: slowCjkTranslator(requests),
    });
    const { browser, url, clickMenu } = session;
    try {
      await session.setPreferences({ targetLanguage: "zh-CN" });
      const browserPage = await browser.open(url("/slow"));
      await browserPage.send("Emulation.setDeviceMetricsOverride", {
        width: 800,
        height: 600,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await clickMenu(url("/slow"));
      await poll(() => requests.length > 0);
      // The screen's paragraphs are asked for first.
      assert.deepEqual(requests[0].slice(0, 2), [
        "Picks for you",
        "Sign in for stories chosen for your interests.",
      ]);
      // Before the answer they show as waiting.
      for (const selector of ["#picks", "#sentence"])
        assert.equal(
          (await poll(() => translationOf(browserPage, selector))).waiting,
          true,
          selector,
        );
      for (const [selector, text] of [
        ["#picks", "译文 译文 译文"],
        ["#sentence", "译文 译文 译文 译文 译文 译文 译文 译文."],
      ])
        assert.deepEqual(
          await poll(async () => {
            const shown = await translationOf(browserPage, selector);
            return shown?.waiting === false && shown;
          }),
          { text, waiting: false, onScreen: true },
          selector,
        );
    } finally {
      await session.close();
    }
  },
);
