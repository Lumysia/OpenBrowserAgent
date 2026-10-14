import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";
import {
  fixtureTranslator,
  pageHtml,
  startPageTranslate,
} from "./page-translate-fixture.mjs";

// Translations keep the page's layout (tests/fixtures/page-translate/
// layout.html): boxes that the page sizes stay as they were, menus and
// buttons are left alone unless the user asks for them, and translation-
// only display changes the text, not the elements.

// Boxes the page designed: their size, and their place where nothing above
// them is translated.
const FIXED = {
  header: { selector: "#site-header", place: true },
  tabs: { selector: "#tabs", place: true },
  activeTab: { selector: "#tabs [aria-selected=true]", place: true },
  titlebar: { selector: "#titlebar", place: true },
  share: { selector: "#share", place: true },
  infobox: { selector: "#infobox", width: true },
  cardTitle: { selector: "#card-title" },
  badge: { selector: "#badge" },
  chips: { selector: "#chips" },
  choices: { selector: "#choices" },
  climateBox: { selector: "#climate-box", width: true },
  sister: { selector: "#sisters li" },
  more: { selector: "#more" },
  stories: { selector: "#stories", width: true },
  meta1: { selector: "#meta-1" },
  meta2: { selector: "#meta-2" },
  meta3: { selector: "#meta-3" },
  thumb1: { selector: "#thumb-1" },
  thumb2: { selector: "#thumb-2" },
  thumb3: { selector: "#thumb-3" },
  clampedHeadline: { selector: "#headline-3" },
  navbox: { selector: "#navbox" },
  refs: { selector: "#refs", width: true },
  footer: { selector: "#site-footer" },
};
const TOLERANCE_PX = 2;
// Text that only menus, buttons, tabs, navigation and the footer have.
const CHROME_TEXT =
  /Trail maps|Mountain weather|Sign in|Search the almanac|Discussion page|Edit history|Share this|Northern passes|Privacy policy|Contact the editors|See more walks/;
// Labels that are kept as they are: times, dates, sources, bylines, names,
// numbers, and the icons after headlines.
const LABEL_TEXT =
  /3 hours ago|Yesterday|Oct 12|Valley Courier|Ridge Weekly|The Hill Post|By Ann Lee|By Dana Moss|By Frank Ode|chevron_right|Elevation|Range/;

function layoutOf(page) {
  return page.call((fixed) => {
    const boxes = {};
    for (const [name, { selector }] of Object.entries(fixed)) {
      const box = document.querySelector(selector).getBoundingClientRect();
      boxes[name] = {
        x: box.left + scrollX,
        y: box.top + scrollY,
        width: box.width,
        height: box.height,
      };
    }
    const climate = document.querySelector("#climate").getBoundingClientRect();
    const room = document.querySelector("#climate-box").getBoundingClientRect();
    return {
      boxes,
      scrollWidth: document.documentElement.scrollWidth,
      climateFits: climate.right <= room.right + 1,
    };
  }, FIXED);
}

// The boxes that moved or changed size, with how.
function changes(before, after) {
  const moved = {};
  for (const [name, rule] of Object.entries(FIXED)) {
    const a = before.boxes[name];
    const b = after.boxes[name];
    const keys = rule.width ? ["x", "width"] : ["x", "width", "height"];
    if (rule.place) keys.push("y");
    const diff = keys.filter((key) => Math.abs(a[key] - b[key]) > TOLERANCE_PX);
    if (diff.length)
      moved[name] = Object.fromEntries(
        diff.map((key) => [key, b[key] - a[key]]),
      );
  }
  return moved;
}

// Translated, or shown as a tooltip, in the element `selector`.
function shownIn(page, selector) {
  return page.call((selector) => {
    const element = document.querySelector(selector);
    const translation = element.querySelector("oba-translation");
    if (translation) return translation.textContent;
    const titled = element.closest("[title]");
    return titled?.title.startsWith("FR:") ? titled.title : undefined;
  }, selector);
}

test(
  "page translation keeps the page's layout",
  { timeout: 180000 },
  async (t) => {
    const batches = [];
    const html = await readFile(
      new URL("./fixtures/page-translate/layout.html", import.meta.url),
      "utf8",
    );
    const session = await startPageTranslate({
      pages: { "/layout": html },
      answer: fixtureTranslator(batches),
    });
    const { browser, url, clickMenu } = session;
    const pageUrl = url("/layout");
    const sent = () => batches.flat().join("\n");
    try {
      const page = await browser.open(pageUrl);
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 800,
        height: 700,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const original = await pageHtml(page);
      const before = await layoutOf(page);
      assert.ok(before.climateFits);

      await t.test(
        "both: boxes stay, menus and buttons are left alone",
        async () => {
          await clickMenu(pageUrl);
          assert.match(
            await poll(() => shownIn(page, "#last")),
            /^FR: Letters/,
          );
          // The last paragraph's batch is in; its frame too.
          await poll(() => shownIn(page, "#p3"));
          await delay(300);
          const after = await layoutOf(page);
          assert.deepEqual(changes(before, after), {});
          assert.equal(after.scrollWidth, before.scrollWidth);
          assert.ok(after.climateFits, "the table stays in its box");
          // Room to spare: under the paragraph. None: on hover.
          assert.match(
            await page.call(
              () =>
                document.querySelector("#intro > oba-translation")?.textContent,
            ),
            /^FR: Read the field guide/,
          );
          assert.match(
            await page.call(() => document.querySelector("#card-title").title),
            /^FR: A very long card title/,
          );
          // The badge is a box of its own between blocks: on hover.
          assert.match(await shownIn(page, "#badge"), /^FR: Recommended/);
          // A headline link: its translation is in it, at the source text's
          // edge, without the icon after it. A clamped one: on hover, in
          // full.
          const headline = await page.call(() => {
            const link = document.querySelector("#headline-1");
            const translation = link.querySelector("oba-translation");
            const range = document.createRange();
            range.selectNodeContents(link.firstChild);
            const source = range.getClientRects()[0];
            range.selectNodeContents(translation);
            return {
              text: translation.textContent,
              icons: translation.querySelectorAll("i, svg, img").length,
              offset: Math.round(range.getClientRects()[0].left - source.left),
            };
          });
          assert.deepEqual(
            { ...headline, text: headline.text.slice(0, 15) },
            { text: "FR: Snow closes", icons: 0, offset: 0 },
          );
          assert.match(
            await shownIn(page, "#headline-3"),
            /^FR: A long walk.* dogs$/,
          );
          assert.equal(await shownIn(page, "#more"), undefined);
          assert.doesNotMatch(sent(), LABEL_TEXT);
          // The skip link is hidden: nothing is added for it.
          assert.equal(
            await page.call(
              () => document.querySelectorAll("body > oba-translation").length,
            ),
            0,
          );
          assert.doesNotMatch(sent(), CHROME_TEXT);
        },
      );

      await t.test(
        "menus and buttons on request, in the room they have",
        async () => {
          await session.setPreferences({ translateMenus: true });
          await poll(() => shownIn(page, "#site-nav li:last-child"));
          await poll(() => shownIn(page, "#tabs [role=tab]:last-child"));
          await poll(() => shownIn(page, "#site-footer li:last-child"));
          // Controls show their translation on hover.
          assert.match(
            await poll(() => shownIn(page, "#more")),
            /^FR: See more/,
          );
          assert.match(
            await page.call(
              () => document.querySelector("#tabs [aria-selected=true]").title,
            ),
            /^FR: Article/,
          );
          await delay(300);
          assert.match(sent(), /Trail maps/);
          const after = await layoutOf(page);
          // The navigation box is a list of links in running text: it may
          // take another line.
          const { navbox, ...moved } = changes(before, after);
          assert.deepEqual(moved, {});
          assert.deepEqual(Object.keys(navbox || {}), navbox ? ["height"] : []);
          assert.equal(after.scrollWidth, before.scrollWidth);
        },
      );

      await t.test("Show original restores the page exactly", async () => {
        await clickMenu(pageUrl);
        await poll(async () => (await pageHtml(page)) === original);
      });

      await t.test("translation only: the text changes in place", async () => {
        await session.setPreferences({
          display: "translation",
          translateMenus: false,
        });
        await page.call(() => {
          window.introLink = document.querySelector("#intro-link");
        });
        await clickMenu(pageUrl);
        await poll(() =>
          page.call(() =>
            document
              .querySelector("#last")
              .textContent.trim()
              .startsWith("FR: "),
          ),
        );
        await delay(300);
        const view = await page.call(() => ({
          added: document.querySelectorAll("oba-translation").length,
          intro: document
            .querySelector("#intro")
            .innerHTML.replace(/\s+/g, " ")
            .trim(),
          sameLink: window.introLink === document.querySelector("#intro-link"),
          title: document.querySelector("#title").textContent.trim(),
          nav: document.querySelector("#site-nav").textContent.includes("FR:"),
          headline: document
            .querySelector("#headline-1")
            .textContent.slice(0, 15),
          labels: [...document.querySelectorAll("#more, .meta, .source")].some(
            (element) => element.textContent.includes("FR:"),
          ),
        }));
        assert.deepEqual(view, {
          added: 0,
          intro:
            'FR: Read the <a id="intro-link" href="/guide">field guide</a> before you <strong>leave the trail</strong>, because the weather turns quickly above the tree line and the paths are not always marked.',
          sameLink: true,
          title: "FR: Walking the high passes",
          nav: false,
          headline: "FR: Snow closes",
          labels: false,
        });
        const after = await layoutOf(page);
        const moved = changes(before, after);
        // Longer text may take more lines; designed sizes stay.
        for (const name of [
          "cardTitle",
          "badge",
          "sister",
          "choices",
          "more",
          "meta1",
          "thumb1",
          "clampedHeadline",
        ])
          assert.equal(moved[name], undefined, name);
        for (const name of [
          "header",
          "tabs",
          "titlebar",
          "share",
          "navbox",
          "footer",
        ])
          assert.equal(moved[name], undefined, name);
        assert.equal(after.scrollWidth, before.scrollWidth);
        await clickMenu(pageUrl);
        await poll(async () => (await pageHtml(page)) === original);
      });
    } finally {
      await session.close();
    }
  },
);
