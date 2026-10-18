import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  fixtureTranslator,
  startPageTranslate,
} from "./page-translate-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import {
  TRANSLATION_GAP,
  TRANSLATION_SPACE_AFTER,
} from "../src/page-translate/render.ts";

// The space around block translations: a gap under the source, and space
// after the translation that sets the pair apart from what comes next, at
// least TRANSLATION_SPACE_AFTER where the page keeps less, the page's own
// where it keeps more. Only where that space joins the page's margins: not
// in flex layouts, at the end of a padded box, or for inline translations.
const ITEM = (n) =>
  `Item ${n} is a sentence long enough to read as content in the list.`;
const PAGE = `<!doctype html><html lang="en"><head><title>Spacing</title>
<style>
body{font:16px/1.5 sans-serif;margin:24px auto;max-width:640px}
ul{margin:0 0 24px;padding-left:20px} li{margin:0}
.flat p{margin:0}
.spaced p{margin:0 0 40px}
h3{margin:30px 0 0;font-size:16px}
.card{padding:12px;border:1px solid #888}
.card ul{margin:0}
nav{display:flex;flex-direction:column;margin:24px 0}
td{padding:4px}
</style></head><body>
<ul id="plain"><li>${ITEM(1)}</li><li>${ITEM(2)}</li><li>${ITEM(3)}</li></ul>
<div class="flat"><p id="flat-1">The first paragraph has no margin, so its lines run on.</p><p id="flat-2">The second paragraph follows it straight after.</p>
<h3 id="heading">A heading with its own margin above it</h3></div>
<div class="spaced"><p id="spaced-1">This paragraph keeps a large margin under it on the page.</p><p>Another paragraph with the same large margin under it.</p></div>
<div class="card" id="card"><ul><li>${ITEM(4)}</li><li id="card-last">${ITEM(5)}</li></ul></div>
<nav id="nav"><a href="#a">Getting started with the mountain guide book</a><a href="#b">Planning a route over the northern passes</a></nav>
<table><tr><td id="cell">North</td><td>A steep climb over loose rock near the top.</td></tr></table>
</body></html>`;

// The translation in `selector`: its gap under the source text, and the
// distance from its bottom to the next block's top (or to the bottom of
// its box's content when nothing follows).
function spacing(page, selector) {
  return page.call((selector) => {
    const element = document.querySelector(selector);
    const translation =
      element.querySelector("oba-translation") ?? element.nextElementSibling;
    const style = getComputedStyle(translation);
    const box = translation.getBoundingClientRect();
    const host = element.closest("li, p, h3, td, nav > a") ?? element;
    const next = host.nextElementSibling?.matches("oba-translation")
      ? host.nextElementSibling.nextElementSibling
      : host.nextElementSibling;
    return {
      inline: translation.hasAttribute("data-oba-inline"),
      fontSize: parseFloat(style.fontSize),
      gap: parseFloat(style.marginBlockStart),
      after: next
        ? Math.round(next.getBoundingClientRect().top - box.bottom)
        : undefined,
      end: parseFloat(style.marginBlockEnd),
    };
  }, selector);
}

const em = (value, fontSize) => Math.round(parseFloat(value) * fontSize);

test(
  "page translation: space between a source and its translation, and after",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const session = await startPageTranslate({
      pages: { "/spacing": PAGE },
      answer: fixtureTranslator(),
    });
    const { browser, url, clickMenu } = session;
    const pageUrl = url("/spacing");
    try {
      const page = await browser.open(pageUrl);
      const before = await page.call(() => {
        const card = document.querySelector("#card").getBoundingClientRect();
        const last = document
          .querySelector("#card-last")
          .getBoundingClientRect();
        return Math.round(card.bottom - last.bottom);
      });
      await clickMenu(pageUrl);
      await poll(() =>
        page.call(
          () =>
            document.querySelectorAll("oba-translation").length >= 12 &&
            !document.querySelector("oba-translation[data-oba-pending]"),
        ),
      );

      await t.test("the gap under the source", async () => {
        const item = await spacing(page, "#plain li");
        // Computed margins keep fractions of a pixel.
        assert.ok(
          Math.abs(item.gap - parseFloat(TRANSLATION_GAP) * item.fontSize) <
            0.5,
          `${item.gap}`,
        );
      });

      await t.test(
        "pairs set apart where the page keeps no space",
        async () => {
          for (const selector of ["#plain li", "#flat-1"]) {
            const pair = await spacing(page, selector);
            assert.equal(
              pair.after,
              em(TRANSLATION_SPACE_AFTER, pair.fontSize),
              selector,
            );
          }
        },
      );

      await t.test(
        "the page's larger space is kept, not added to",
        async () => {
          // The paragraph's own margin, moved under the translation.
          assert.equal((await spacing(page, "#spaced-1")).after, 40);
          // The next block's margin above it collapses with the space after.
          assert.equal((await spacing(page, "#flat-2")).after, 30);
        },
      );

      await t.test("a padded box's last translation adds nothing", async () => {
        const after = await page.call(() => {
          const card = document.querySelector("#card").getBoundingClientRect();
          const translation = document
            .querySelector("#card-last > oba-translation")
            .getBoundingClientRect();
          return Math.round(card.bottom - translation.bottom);
        });
        assert.equal(after, before);
      });

      await t.test(
        "flex items and inline translations keep their margins",
        async () => {
          // Only the space the page kept under the link, moved under its
          // translation.
          const link = await spacing(page, "#nav a");
          assert.ok(
            link.end < em(TRANSLATION_SPACE_AFTER, link.fontSize),
            `${link.end}`,
          );
          const cell = await spacing(page, "#cell");
          assert.deepEqual([cell.inline, cell.gap, cell.end], [true, 0, 0]);
        },
      );
    } finally {
      await session.close();
    }
  },
);
