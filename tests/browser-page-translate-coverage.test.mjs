import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// Text the page sets in ways that once kept it from showing its
// translation: lines with trimmed leading (the text reaches below its box,
// and so does the translation after it) and a heading animated word by
// word next to a visually hidden copy of the whole sentence, and text in an
// element without a box of its own (`display: contents`).
// Enough text below for a large page: only paragraphs near the window are
// sent, as each comes into view.
const NOTES = Array.from(
  { length: 48 },
  (_, index) =>
    `<p>Note ${index + 1}: the path past the old mill floods after heavy rain, so the upper trail is the safer way round.</p>`,
).join("");

const PAGE = `<!doctype html><html lang="en"><head><title>Walks</title>
<style>
body{font:17px/1.6 sans-serif;margin:24px auto;max-width:640px;padding:0 16px}
.trim{display:flow-root;line-height:1.6}
.trim::before{content:"";display:table;margin-bottom:-0.45em}
.trim::after{content:"";display:table;margin-top:-0.55em}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.word{display:inline-block}
</style></head><body>
<main>
<h1 id="animated"><span class="sr-only">Maps for the long walk home</span><span class="word">Maps</span> <span class="word">for</span> <span class="word">the</span> <span class="word">long</span> <span class="word">walk</span> <span class="word">home</span></h1>
<section>
<h2 id="trimmed-title" class="trim">Trails worth the climb</h2>
<p id="trimmed-text" class="trim">Each of these trails rewards an early start with a quiet summit and a view over the valley.</p>
</section>
<section>
<h2 id="contents-title"><span style="display:contents">Gear for every season</span></h2>
<p id="contents-text"><span style="display:contents">Pack light, but bring <a href="#gear">a warm layer</a> for the evening on the ridge.</span></p>
</section>
</main>
<div>${NOTES}</div>
</body></html>`;

test(
  "page translation: trimmed leading, animated headings, boxless text",
  {
    timeout: BROWSER_TEST_TIMEOUT,
  },
  async (t) => {
    const sent = [];
    const session = await startPageTranslate({
      pages: { "/walks": PAGE },
      answer: fixtureTranslator(sent),
    });
    const { browser, url, clickMenu } = session;
    const pageUrl = url("/walks");
    try {
      const page = await browser.open(pageUrl);
      await clickMenu(pageUrl);
      await poll(() => translationIn(page, "#trimmed-text"));

      await t.test(
        "text reaching below its box keeps its translation in place",
        async () => {
          for (const selector of ["#trimmed-title", "#trimmed-text"]) {
            assert.match(await translationIn(page, selector), /^FR: /);
            // Not moved into a tooltip.
            assert.equal(
              await page.call(
                (selector) =>
                  document.querySelector(selector).getAttribute("title"),
                selector,
              ),
              null,
            );
          }
        },
      );

      await t.test(
        "a hidden copy of an animated heading isn't translated twice",
        async () => {
          const heading = await poll(() => translationIn(page, "#animated"));
          assert.equal(heading.match(/long walk home/g)?.length, 1);
          const texts = sent.flat().filter((text) => text.includes("walk"));
          assert.equal(texts.length, 1);
          assert.equal(texts[0].match(/home/g)?.length, 1);
        },
      );

      await t.test(
        "text in an element without a box of its own is translated",
        async () => {
          for (const selector of ["#contents-title", "#contents-text"])
            assert.match(
              await poll(() => translationIn(page, selector)),
              /^FR: /,
            );
        },
      );
    } finally {
      await session.close();
    }
  },
);
