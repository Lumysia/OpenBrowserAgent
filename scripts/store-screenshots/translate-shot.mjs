import { PAGE_TRANSLATE_ENGINE } from "../../src/shared/page-translate/settings.ts";
import { movePointer } from "../../tests/cdp-input.mjs";
import { providerFixture, reply } from "../../tests/provider-fixtures.ts";
import { hasClass, inShadowRoot } from "../../tests/shadow-roots.mjs";
import {
  FRAME,
  capture,
  click,
  delay,
  launch,
  openDemo,
  openPanel,
  poll,
  size,
} from "./browser.mjs";
import { DEMO_URLS, loadDemo, renderPage } from "./demo.mjs";
import { seedChat } from "./chat-shots.mjs";

// The article is shown in another language and translated into the
// locale's: English for every locale but English, which reads Japanese.
const sourceLocale = (locale) => (locale === "en-US" ? "ja-JP" : "en-US");

// The texts of the article, in the same order in every locale.
const leaves = (value) =>
  typeof value === "string" ? [value] : Object.values(value).flatMap(leaves);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CODE = /`([^`]+)`/g;
const hasCode = (text) => text.includes("`");

// Translates like a model from the demo texts: the article in `from` and in
// `to` are the same items, so each item is answered with its counterpart.
// Code spans reach the model as `{n}` markers, which the answer keeps.
function demoTranslator(from, to) {
  const pairs = leaves(from.article).map((source, index) => [
    source,
    leaves(to.article)[index],
  ]);
  const withCode = pairs
    .filter(([source]) => hasCode(source))
    .map(([source, target]) => ({
      pattern: new RegExp(
        `^${source
          .split(CODE)
          .map((part, index) =>
            index % 2 ? "(\\{\\s*\\d+\\s*\\})" : escapeRegExp(part),
          )
          .join("")}$`,
      ),
      target,
    }));
  // Longest first, so a sentence wins over a word inside it.
  const plain = pairs
    .filter(([source]) => !hasCode(source))
    .sort(([a], [b]) => b.length - a.length);
  return (text) => {
    for (const { pattern, target } of withCode) {
      const match = text.trim().match(pattern);
      if (match) {
        const atoms = match.slice(1);
        return target.replace(CODE, () => atoms.shift());
      }
    }
    // Inline markers (`<b1>`, `{2}`) stay; the text between them is
    // replaced piece by piece.
    return text
      .split(/(<\s*\/?\s*b\d+\s*>|\{\s*\d+\s*\})/)
      .map((part, index) =>
        index % 2
          ? part
          : plain.reduce(
              (result, [source, target]) => result.replaceAll(source, target),
              part,
            ),
      )
      .join("");
  };
}

// The translate button on the page's edge, in its closed shadow root: its
// center and edge once it has stopped moving.
function pageButton(tab) {
  return inShadowRoot(
    tab,
    (root) =>
      root.shadowRootType === "closed" &&
      root.children?.some((child) => hasClass(child, "page-button-theme")),
    (root) => {
      const dock = root?.querySelector(".page-button-dock");
      if (!dock || root.getAnimations().length) return null;
      const rect = root.querySelector(".page-button").getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        edge: dock.dataset.edge,
      };
    },
  );
}

// The button sits half tucked into the edge; the pointer on its visible
// half slides it out, as a user sees it before clicking.
async function showPageButton(tab) {
  const tucked = await poll(() => pageButton(tab));
  const inward = {
    right: { x: -6, y: 0 },
    left: { x: 6, y: 0 },
    top: { x: 0, y: 6 },
    bottom: { x: 0, y: -6 },
  }[tucked.edge];
  const point = { x: tucked.x + inward.x, y: tucked.y + inward.y };
  // Pointed at again until it is out: a move while it still settles from
  // the page's changes can go unseen.
  for (let attempt = 0; attempt < 5; attempt++) {
    await movePointer(tab, { x: FRAME.width / 2, y: FRAME.height / 2 });
    await movePointer(tab, point);
    await delay(200);
    const button = await poll(() => pageButton(tab));
    if (button.x !== tucked.x || button.y !== tucked.y) return;
    await delay(500);
  }
  throw new Error("The translate button did not slide out");
}

const userText = (body) =>
  (body.messages || [])
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.text || "").join(""),
    )
    .join("\n");

// The demo article in another language, translated with the original kept
// above each translation, and the translate button on the page's edge. The
// translation is started from the side panel's "This page" strip.
export async function translateShot(demo) {
  const source = await loadDemo(sourceLocale(demo.locale));
  const translate = demoTranslator(source, demo);
  const fixture = await providerFixture((request, response) => {
    const prompt = userText(request.body);
    if (!prompt.includes("[[end]]"))
      return reply(response, request.protocol, { text: demo.ask.chatTitle });
    const items = [
      ...prompt.matchAll(/^\[\[(\d+)\]\]\n([\s\S]*?)(?=\n\[\[)/gm),
    ];
    reply(response, request.protocol, {
      text: [
        ...items.map(([, id, text]) => `[[${id}]]\n${translate(text)}`),
        "[[end]]",
      ].join("\n"),
    });
  });
  const chromium = await launch(demo.locale);
  try {
    await seedChat(chromium, fixture, demo, "ask-agent", {
      pageTranslate: { engine: PAGE_TRANSLATE_ENGINE.model },
    });
    const tab = await openDemo(
      chromium,
      DEMO_URLS.article,
      await renderPage("article", source),
    );
    await size(tab, FRAME);
    const panel = await openPanel(chromium, demo.locale);
    await click(panel, ".page-tools-switches .ui-toggle-group-item");
    // Capturing the panel renders it as the visible tab; the page only
    // translates what it sees once it is in front again.
    await tab.send("Page.bringToFront");
    // Done once every block of the article that shows has its translation.
    await poll(
      () =>
        tab.call(() => {
          const blocks = [
            ...document.querySelectorAll("main :is(h1, h2, p, li, figcaption)"),
          ].filter((block) => block.getBoundingClientRect().top < innerHeight);
          return (
            blocks.length > 0 &&
            blocks.every((block) => block.querySelector("oba-translation"))
          );
        }),
      60000,
    );
    await showPageButton(tab);
    await delay(2500);
    const warnings = await tab.call(() =>
      [...document.querySelectorAll("main oba-translation")]
        .filter((element) => !element.textContent.trim())
        .map(() => "empty translation"),
    );
    return { png: await capture(tab), warnings };
  } finally {
    await chromium.close();
    await fixture.close();
  }
}
