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
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// Translations keep the page's layout (tests/fixtures/page-translate/
// layout.html): the page may grow taller with the translations, but boxes
// that the page sizes keep their size, nothing sticks out of its box or
// scrolls the page sideways, menus and buttons are left alone unless the
// user asks for them, and translation-only display changes the text, not
// the elements.

// Boxes the page designed, and what of them stays: `place` (where and how
// big: nothing above them is translated), `size` (how big; they may move
// down) or `width` (they may grow taller).
const FIXED = {
  header: { selector: "#site-header", keep: "place" },
  tabs: { selector: "#tabs", keep: "place" },
  activeTab: { selector: "#tabs [aria-selected=true]", keep: "place" },
  titlebar: { selector: "#titlebar", keep: "width" },
  share: { selector: "#share", keep: "size" },
  infobox: { selector: "#infobox", keep: "width" },
  cardTitle: { selector: "#card-title", keep: "size" },
  badge: { selector: "#badge", keep: "size" },
  chips: { selector: "#chips", keep: "width" },
  choices: { selector: "#choices", keep: "size" },
  climateBox: { selector: "#climate-box", keep: "width" },
  sister: { selector: "#sisters li", keep: "size" },
  more: { selector: "#more", keep: "size" },
  panelTop: { selector: "#panel-top", keep: "width" },
  panelPicks: { selector: "#panel-picks", keep: "width" },
  stories: { selector: "#stories", keep: "width" },
  meta1: { selector: "#meta-1", keep: "size" },
  meta2: { selector: "#meta-2", keep: "size" },
  meta3: { selector: "#meta-3", keep: "size" },
  thumb1: { selector: "#thumb-1", keep: "size" },
  thumb2: { selector: "#thumb-2", keep: "size" },
  thumb3: { selector: "#thumb-3", keep: "size" },
  clampedHeadline: { selector: "#headline-3", keep: "size" },
  navbox: { selector: "#navbox", keep: "size" },
  refs: { selector: "#refs", keep: "width" },
  footer: { selector: "#site-footer", keep: "size" },
};
const KEYS = {
  place: ["x", "y", "width", "height"],
  size: ["x", "width", "height"],
  width: ["x", "width"],
};
const TOLERANCE_PX = 2;
// Text that only menus, buttons, tabs, navigation and the footer have.
const CHROME_TEXT =
  /Trail maps|Mountain weather|Sign in|Search the almanac|Discussion page|Edit history|Share this|Northern passes|Privacy policy|Contact the editors|See more walks/;
// Labels that are kept as they are: times, dates, sources and bylines (short
// lines next to a date), and the icons after headlines.
const LABEL_TEXT =
  /3 hours ago|Yesterday|Oct 12|Valley Courier|Ridge Weekly|The Hill Post|By Ann Lee|By Dana Moss|By Frank Ode|chevron_right/;

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

// The boxes that moved or changed size where they shouldn't, with how.
function changes(before, after) {
  const moved = {};
  for (const [name, { keep }] of Object.entries(FIXED)) {
    const a = before.boxes[name];
    const b = after.boxes[name];
    const diff = KEYS[keep].filter(
      (key) => Math.abs(a[key] - b[key]) > TOLERANCE_PX,
    );
    if (diff.length)
      moved[name] = Object.fromEntries(
        diff.map((key) => [key, b[key] - a[key]]),
      );
  }
  return moved;
}

// Translations that stick out of the element they are in (the rule before
// a translation sits in the margin, outside its text's edge).
function overflowing(page) {
  return page.call(() =>
    [...document.querySelectorAll("oba-translation")].flatMap((element) => {
      const box = element.getBoundingClientRect();
      const room = element.parentElement.getBoundingClientRect();
      const mark = -parseFloat(getComputedStyle(element).marginInlineStart);
      return box.right > room.right + 1 ||
        box.bottom > room.bottom + 1 ||
        box.left < room.left - 1 - Math.max(0, mark)
        ? [element.textContent.slice(0, 30)]
        : [];
    }),
  );
}

// The translation of the element `selector`: shown in it or right after
// it, or as a tooltip of it or of an element around it or in it.
function shownIn(page, selector) {
  return page.call((selector) => {
    const element = document.querySelector(selector);
    const after = element.nextElementSibling;
    const translation =
      element.querySelector("oba-translation") ??
      (after?.matches("oba-translation") ? after : null);
    if (translation) return translation.textContent;
    const titled =
      element.closest("[title]") ?? element.querySelector("[title]");
    return titled?.title.startsWith("FR:") ? titled.title : undefined;
  }, selector);
}

// How the translation right after the element `selector` sits next to its
// source text, and how it looks.
function besideSource(page, selector) {
  return page.call((selector) => {
    const source = document.querySelector(selector);
    const translation = source.nextElementSibling;
    if (!translation?.matches("oba-translation")) return undefined;
    const range = document.createRange();
    const text = [...source.childNodes].find(
      (node) => node.nodeType === 3 && node.data.trim(),
    );
    range.selectNodeContents(text);
    const from = range.getClientRects()[0];
    range.selectNodeContents(translation);
    const to = range.getClientRects()[0];
    const style = getComputedStyle(translation);
    const sourceStyle = getComputedStyle(source);
    return {
      text: translation.textContent.slice(0, 15),
      offset: Math.round(to.left - from.left),
      below: to.top >= from.bottom - 1,
      sameLook:
        style.color === sourceStyle.color &&
        style.fontWeight === sourceStyle.fontWeight &&
        style.fontSize === sourceStyle.fontSize,
      link: !!(translation.closest("a") || translation.querySelector("a")),
      icons: translation.querySelectorAll("i, svg, img").length,
      clamp: style.webkitLineClamp,
      title: translation.title,
      mark: translation.hasAttribute("data-oba-mark"),
    };
  }, selector);
}

test(
  "page translation keeps the page's layout",
  { timeout: BROWSER_TEST_TIMEOUT },
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
          assert.deepEqual(await overflowing(page), []);
          // Room to spare: under the paragraph, at its text's edge. The page's
          // 16px margin is too narrow for the rule.
          const intro = await page.call(() => {
            const translation = document.querySelector(
              "#intro > oba-translation",
            );
            const range = document.createRange();
            range.selectNodeContents(
              document.querySelector("#intro").firstChild,
            );
            const from = range.getClientRects()[0];
            range.selectNodeContents(translation);
            return {
              text: translation.textContent.slice(0, 24),
              offset: Math.round(range.getClientRects()[0].left - from.left),
              mark: translation.hasAttribute("data-oba-mark"),
            };
          });
          assert.deepEqual(intro, {
            text: "FR: Read the field guide",
            offset: 0,
            mark: false,
          });
          // A clamped title: its translation after it, clamped the same way,
          // whole on hover.
          const cardTitle = await besideSource(page, "#card-title");
          assert.equal(cardTitle.clamp, "2");
          assert.match(cardTitle.title, /^FR: A very long card title.* deep$/);
          // A box of its own between blocks (a badge): after it.
          assert.match(await shownIn(page, "#badge"), /^FR: Recommended/);
          // A headline link: its translation right after it, at the source
          // text's edge, in its colour, not a second link, without the icon
          // after it, and without the rule inside a card.
          assert.deepEqual(await besideSource(page, "#headline-1"), {
            text: "FR: Snow closes",
            offset: 0,
            below: true,
            sameLook: true,
            link: false,
            icons: 0,
            clamp: "none",
            title: "",
            mark: false,
          });
          // A clamped headline: shown too, clamped the same way.
          const clamped = await besideSource(page, "#headline-3");
          assert.equal(clamped.clamp, "2");
          assert.match(clamped.title, /^FR: A long walk.* dogs$/);
          // Sibling section headings look alike: under the source, in its
          // font and colour, above the heading's rule.
          for (const selector of ["#head-link", "#head-flex"]) {
            const heading = await page.call((selector) => {
              const source = document.querySelector(selector);
              const translation =
                source.querySelector("oba-translation") ??
                source.nextElementSibling;
              const range = document.createRange();
              range.selectNodeContents(source.firstChild);
              const from = range.getClientRects()[0];
              const to = translation.getBoundingClientRect();
              const head = source
                .closest(".panel-head")
                .getBoundingClientRect();
              const look = (element) => {
                const style = getComputedStyle(element);
                return `${style.color} ${style.fontWeight} ${style.fontSize}`;
              };
              return {
                text: translation.textContent.slice(0, 4),
                offset: Math.round(to.left - from.left),
                below: to.top >= from.bottom - 1,
                inHead: to.bottom <= head.bottom,
                sameLook: look(translation) === look(source),
                link: !!translation.querySelector("a"),
              };
            }, selector);
            assert.deepEqual(
              heading,
              {
                text: "FR: ",
                offset: 0,
                below: true,
                inHead: true,
                sameLook: true,
                link: false,
              },
              selector,
            );
          }
          assert.equal(await shownIn(page, "#more"), undefined);
          // Words only screen readers get (transparent, laid over the page)
          // next to a price: nothing shows.
          assert.equal(await shownIn(page, "#price"), undefined);
          assert.doesNotMatch(sent(), LABEL_TEXT);
          // A table's header cells are words, whatever their case.
          assert.match(sent(), /^Elevation$/m);
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
          // The navigation box (links in running text) and the footer (a
          // grid of links) may grow taller.
          const { navbox, footer, ...moved } = changes(before, after);
          assert.deepEqual(moved, {});
          for (const box of [navbox, footer])
            assert.deepEqual(Object.keys(box || {}), box ? ["height"] : []);
          assert.equal(after.scrollWidth, before.scrollWidth);
          assert.deepEqual(await overflowing(page), []);
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
