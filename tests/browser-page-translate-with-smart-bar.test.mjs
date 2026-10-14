import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";

// With the smart bar on, its page script also receives the menu's message
// and the browser reports it delivered without an answer. The first click
// must still inject the page translation script and translate.
test(
  "page translation starts on the first click with the smart bar on",
  { timeout: 120000 },
  async () => {
    const session = await startPageTranslate({
      pages: { "/article": articlePage({ paragraphs: 8 }) },
      answer: fixtureTranslator(),
      smartBar: { enabled: true },
    });
    const { browser, url, clickMenu } = session;
    const pageUrl = url("/article");
    try {
      const page = await browser.open(pageUrl);
      // The smart bar's page script is in the page before the click.
      await poll(() => page.call(() => document.readyState === "complete"));
      await clickMenu(pageUrl);
      const intro = await poll(() => translationIn(page, "#intro"));
      assert.match(intro, /^FR: /);
    } finally {
      await session.close();
    }
  },
);
