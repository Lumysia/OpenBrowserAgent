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
          '<a id="next" href="/next">Next day</a><a id="aside" href="/aside" target="_blank">Aside</a></article>',
        ),
        "/next": nextPage,
        "/aside": nextPage.replace("Next notes", "Aside notes"),
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

      // A link it opens in a new tab is translated there too.
      // As a user's click: without a gesture it would be blocked as a popup.
      // (A mouse click could land beside it while translations move it.)
      await page.send("Runtime.evaluate", {
        expression: 'document.querySelector("#aside").click()',
        userGesture: true,
      });
      const aside = await browser.attach((href) => href === url("/aside"));
      assert.match(await at(aside, "/aside", "#intro"), /^FR: /);
      // The menu follows the tab in front.
      await page.send("Page.bringToFront");

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

// Single-page routers show the next page by putting a new <body> in place
// of the old one, keeping some elements across (a persisted header).
const routedArticle = articlePage({ paragraphs: 5 }).replace(
  "</article>",
  `<a id="next" href="/next">Next day</a></article>
<script>
document.addEventListener("click", async (event) => {
  const link = event.target.closest("#next");
  if (!link) return;
  event.preventDefault();
  const next = new DOMParser().parseFromString(
    await (await fetch(link.href)).text(),
    "text/html",
  );
  next.querySelector("#title").replaceWith(document.querySelector("#title"));
  document.title = next.title;
  history.pushState(null, "", link.href);
  document.body.replaceWith(document.adoptNode(next.body));
});
</script>`,
);

test(
  "a translated tab translates the body a single-page router swaps in",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startPageTranslate({
      pages: { "/article": routedArticle, "/next": nextPage },
      answer: fixtureTranslator(),
    });
    const { browser, url, clickMenu, menuTitles } = session;
    const translations = (page, selector) =>
      page.call(
        (selector) =>
          document.querySelectorAll(`${selector} oba-translation`).length,
        selector,
      );
    try {
      const page = await browser.open(url("/article"));
      await clickMenu(url("/article"));
      await poll(() => translationIn(page, "#title"));

      await page.call(() => document.querySelector("#next").click());
      await poll(() =>
        page.call(() =>
          document
            .querySelector("#intro")
            ?.textContent.startsWith("The second day"),
        ),
      );
      assert.equal(
        await poll(() => translationIn(page, "#intro")),
        "FR: The second day starts early, before the sun reaches the valley.",
      );
      await poll(() => translationIn(page, "#title"));
      // The element kept from the first page is translated once, like the
      // rest, also after the background asks again for the new address.
      await unchangedFor(() =>
        page.call(() => document.querySelectorAll("oba-translation").length),
      );
      assert.equal(await translations(page, "#title"), 1);
      assert.equal(await translations(page, "#intro"), 1);
      assert.equal((await menuTitles()).at(-1), "Show original");

      await clickMenu(url("/next"));
      await poll(
        async () => (await menuTitles()).at(-1) === "Translate this page",
      );
      await unchangedFor(() =>
        page.call(() => document.querySelectorAll("oba-translation").length),
      ).then((count) => assert.equal(count, 0));
    } finally {
      await session.close();
    }
  },
);
