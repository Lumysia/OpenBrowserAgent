import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT, unchangedFor } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";

const nextPage = `<!doctype html><html lang="en"><head><title>Next notes</title></head><body>
<h1 id="title">More notes from the field</h1>
<p id="intro">The second day starts early, before the sun reaches the valley.</p>
</body></html>`;

// After "Translate this page", later pages in the same tab are translated
// too, until the tab is reloaded.
test(
  "a translated tab keeps translating until it is reloaded",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startPageTranslate({
      pages: {
        "/article": articlePage({ paragraphs: 5 }).replace(
          "</article>",
          '<a id="next" href="/next">Next day</a></article>',
        ),
        "/next": nextPage,
      },
      answer: fixtureTranslator(),
    });
    const { browser, url, clickMenu, menuTitles } = session;
    // The page may be between documents while it navigates.
    const at = (page, path, selector) =>
      poll(() =>
        page
          .call(
            ({ href, selector }) =>
              location.href === href &&
              document.readyState === "complete" &&
              (selector
                ? document.querySelector(`${selector} > oba-translation`)
                    ?.textContent
                : true),
            { href: url(path), selector },
          )
          .catch(() => false),
      );
    try {
      const page = await browser.open(url("/article"));
      await clickMenu(url("/article"));
      await poll(() => translationIn(page, "#intro"));

      await page.call(() => document.querySelector("#next").click());
      assert.equal(
        await at(page, "/next", "#intro"),
        "FR: The second day starts early, before the sun reaches the valley.",
      );
      await poll(async () => (await menuTitles()).at(-1) === "Show original");

      // Back to the first page, from the back/forward cache or loaded again.
      await page.call(() => history.back());
      assert.match(await at(page, "/article", "#intro"), /^FR: /);

      await page.call(() => history.forward());
      await at(page, "/next", "#intro");
      await page.send("Page.reload");
      await poll(
        async () => (await menuTitles()).at(-1) === "Translate this page",
      );
      await at(page, "/next");
      // The reloaded page shows its original, and stays so.
      await unchangedFor(() =>
        page.call(() => document.querySelectorAll("oba-translation").length),
      ).then((count) => assert.equal(count, 0));

      // Nor is the next page.
      await page.call((href) => (location.href = href), url("/article"));
      await at(page, "/article");
      await unchangedFor(() =>
        page.call(() => document.querySelectorAll("oba-translation").length),
      ).then((count) => assert.equal(count, 0));
    } finally {
      await session.close();
    }
  },
);
