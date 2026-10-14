import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";
import {
  articlePage,
  fixtureTranslator,
  pageHtml,
  startPageTranslate,
  translationIn,
} from "./page-translate-fixture.mjs";

// Page translation from the right-click menu with the AI engine: what gets
// translated first, what never does, how translations look, new content,
// and "Show original".
test("page translation with the AI model", { timeout: 240000 }, async (t) => {
  const batches = [];
  const session = await startPageTranslate({
    pages: { "/article": articlePage({ paragraphs: 120 }) },
    answer: fixtureTranslator(batches),
  });
  const { browser, url, clickMenu, menuTitles } = session;
  const pageUrl = url("/article");
  try {
    const page = await browser.open(pageUrl);
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 800,
      height: 700,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const original = await pageHtml(page);

    await t.test("visible paragraphs first, the rest on scroll", async () => {
      const started = Date.now();
      await clickMenu(pageUrl);
      const intro = await poll(() => translationIn(page, "#intro"));
      assert.ok(
        Date.now() - started < 3000,
        `first translation after ${Date.now() - started} ms`,
      );
      assert.equal(
        intro,
        "FR: Read the field guide before you leave the trail, and run check-gear first.",
      );
      // The first request is small, so it comes back quickly.
      assert.ok(batches[0].length <= 3, `first batch ${batches[0].length}`);
      assert.equal(
        await translationIn(page, "#title"),
        "FR: Notes from the field",
      );
      await poll(() => translationIn(page, "#list > li:first-child"));
      // Far below the screen: not yet.
      await delay(1000);
      assert.equal(await translationIn(page, "#p120"), undefined);
      assert.ok(
        !batches.flat().some((text) => text.includes("number 120 ")),
        "nothing far below the screen was sent",
      );
      await page.call(() =>
        document.querySelector("#p120").scrollIntoView({ block: "center" }),
      );
      assert.match(
        await poll(() => translationIn(page, "#p120")),
        /^FR: Paragraph number 120 /,
      );
      await poll(async () => (await menuTitles()).at(-1) === "Show original");
    });

    await t.test("links, emphasis and code are kept", async () => {
      const intro = await page.call(() => {
        const translation = document.querySelector("#intro > oba-translation");
        const link = translation.querySelector("a");
        return {
          link: link && [link.getAttribute("href"), link.id, link.textContent],
          strong: translation.querySelector("strong")?.textContent,
          code: translation.querySelector("code")?.textContent,
          lang: translation.lang,
          translate: translation.getAttribute("translate"),
        };
      });
      assert.deepEqual(intro, {
        link: ["/guide", "", "field guide"],
        strong: "leave the trail",
        code: "check-gear",
        lang: "en",
        translate: "no",
      });
    });

    await t.test("code, fields and no-translate text stay", async () => {
      const untouched = await page.call(() => ({
        pre: document.querySelector("#code").outerHTML,
        skip: document.querySelector("#skip").outerHTML,
        name: document.querySelector("#name").value,
        notes: document.querySelector("#notes").value,
        notesHtml: document.querySelector("#notes").outerHTML,
      }));
      assert.deepEqual(untouched, {
        pre: '<pre id="code">const trail = "do not translate this code";</pre>',
        skip: '<p id="skip" translate="no">This sentence must stay as it is.</p>',
        name: "Keep this value",
        notes: "Keep these notes",
        notesHtml: '<textarea id="notes">Keep these notes</textarea>',
      });
      assert.ok(
        !batches
          .flat()
          .some((text) => /do not translate|must stay|Keep th/.test(text)),
      );
      // The label's text is translated, its field stays inside it.
      assert.equal(
        await page.call(() => document.querySelectorAll("#label input").length),
        1,
      );
    });

    await t.test("Show original restores the page exactly", async () => {
      await page.call(() => scrollTo(0, 0));
      await clickMenu(pageUrl);
      await poll(
        async () => (await menuTitles()).at(-1) === "Translate this page",
      );
      await poll(async () => (await pageHtml(page)) === original);
      assert.equal(
        await page.call(
          () => document.querySelectorAll("oba-translation").length,
        ),
        0,
      );
    });

    await t.test("translating again is instant, new content too", async () => {
      const sent = batches.length;
      await clickMenu(pageUrl);
      await poll(() => translationIn(page, "#intro"));
      // What was translated before comes from memory.
      await delay(500);
      assert.ok(
        !batches
          .slice(sent)
          .flat()
          .some((text) => /field guide|Notes from the field/.test(text)),
      );
      await page.call(() => document.querySelector("#add").click());
      assert.equal(
        await poll(() => translationIn(page, "#dynamic")),
        "FR: A paragraph that appeared later.",
      );
      // A paragraph whose text changes is translated again.
      await page.call(() => {
        document.querySelector("#dynamic").firstChild.data =
          "The paragraph changed.";
      });
      assert.equal(
        await poll(async () => {
          const text = await translationIn(page, "#dynamic");
          return text === "FR: The paragraph changed." && text;
        }),
        "FR: The paragraph changed.",
      );
      await clickMenu(pageUrl);
      await poll(async () =>
        page.call(() => !document.querySelector("oba-translation")),
      );
    });

    await t.test("translation-only display", async () => {
      const before = await pageHtml(page);
      await session.setPreferences({ display: "translation" });
      await clickMenu(pageUrl);
      // Each block shows a copy of itself with the translation; the original
      // is hidden. Blocks with other content keep both.
      const view = await poll(() =>
        page.call(() => {
          const mirror = document.querySelector("#title + h1");
          const shown = (selector) =>
            [...document.querySelectorAll(selector)]
              .filter((item) => getComputedStyle(item).display !== "none")
              .map((item) => item.textContent);
          if (!mirror?.hasAttribute("data-oba-translation")) return null;
          if (
            shown("#list > li")[1] !== "FR: Tell someone where you are going."
          )
            return null;
          const style = (selector) =>
            getComputedStyle(document.querySelector(selector));
          return {
            only: document.documentElement.hasAttribute(
              "data-oba-translation-only",
            ),
            title: shown("h1"),
            sameSize:
              style("#title + h1").fontSize === style("#title").fontSize,
            list: shown("#list > li"),
            sameMargin: style("#p1 + p").marginTop === style("#skip").marginTop,
          };
        }),
      );
      assert.deepEqual(view, {
        only: true,
        title: ["FR: Notes from the field"],
        sameSize: true,
        list: [
          "FR: Bring enough water for the day.",
          "FR: Tell someone where you are going.",
        ],
        sameMargin: true,
      });
      // Back to both, at once, without asking for translations again.
      await session.setPreferences({ display: "bilingual" });
      await poll(() => page.call(() => !document.querySelector("#title + h1")));
      assert.equal(
        await translationIn(page, "#title"),
        "FR: Notes from the field",
      );
      await clickMenu(pageUrl);
      await poll(async () => (await pageHtml(page)) === before);
    });

    await t.test("pages that can't be translated say so", async () => {
      await browser.open("chrome://version/");
      await clickMenu("chrome://version/");
      await poll(() =>
        session.worker.call(async () => {
          const [tab] = await chrome.tabs.query({ url: "chrome://version/" });
          return (
            (await chrome.action.getBadgeText({ tabId: tab.id })) === "!" &&
            (await chrome.action.getTitle({ tabId: tab.id })).startsWith(
              "Can't translate this page",
            )
          );
        }),
      );
    });
  } finally {
    await session.close();
  }
});

// An update or reload of the extension leaves the translated page's script
// behind; translating again shows one translation per paragraph, and "Show
// original" gives back the page.
test(
  "page translation after the extension reloads",
  { timeout: 120000 },
  async () => {
    const session = await startPageTranslate({
      pages: { "/article": articlePage({ paragraphs: 5 }) },
      answer: fixtureTranslator(),
      // Chromium turns off a command-line extension that reloads without it.
      launch: { preferences: { extensions: { ui: { developer_mode: true } } } },
    });
    const { browser, url } = session;
    const pageUrl = url("/article");
    const translations = (page) =>
      page.call(() =>
        [...document.querySelectorAll("#intro > oba-translation")].map(
          (item) => item.textContent,
        ),
      );
    try {
      const page = await browser.open(pageUrl);
      const original = await pageHtml(page);
      await session.clickMenu(pageUrl);
      await poll(() => translationIn(page, "#intro"));

      const reloaded = await session.reloadExtension();
      await reloaded.clickMenu(pageUrl);
      await poll(async () => (await translations(page)).length && page);
      // The new copy's translations, without the old one's.
      await delay(1000);
      assert.deepEqual(await translations(page), [
        "FR: Read the field guide before you leave the trail, and run check-gear first.",
      ]);
      await reloaded.clickMenu(pageUrl);
      await poll(async () => (await pageHtml(page)) === original);
    } finally {
      await session.close();
    }
  },
);
