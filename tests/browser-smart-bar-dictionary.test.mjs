import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";
import {
  barState,
  clickInBar,
  inSmartBar,
  resultText,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// Translate on a word answers with a dictionary entry;
// sentences and the other actions keep their plain results.
const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p{width:420px;margin:0 0 24px}</style>
<p>What a <span id="word">serendipity</span> it was to meet her.</p>
<p>The joy was <span id="broken">ephemeral</span> but real.</p>
<p>In Chinese, <span id="chinese">机会</span> is a chance.</p>
<p id="sentence">The quick brown fox jumps over the lazy dog.</p>`;

const ENTRY = {
  headword: "serendipity",
  pronunciation: "/ˌserənˈdɪpəti/",
  partOfSpeech: "noun",
  contextMeaning: "a lucky chance meeting",
  otherMeanings: ["the habit of making happy discoveries by accident"],
  examples: [
    {
      text: "Finding that café was pure serendipity.",
      translation: "Finding that café was a happy accident.",
    },
  ],
  synonyms: ["chance", "fluke"],
  translation: "happy accident",
};

const selected = (prompt, text) =>
  prompt.includes(`<text>\\n${text}\\n</text>`);

test("smart bar dictionary", { timeout: BROWSER_TEST_TIMEOUT }, async (t) => {
  const session = await startSmartBar({
    pages: { "/page": PAGE },
    smartBar: { enabled: true },
    answer: async (prompt, write) => {
      if (prompt.includes("Explain the text below"))
        return write("A happy accident.");
      if (selected(prompt, "ephemeral")) return write("short-lived");
      if (selected(prompt, "serendipity")) {
        // Streamed in small pieces, fenced as some models do.
        const answer = "```json\n" + JSON.stringify(ENTRY, null, 2) + "\n```";
        for (let index = 0; index < answer.length; index += 24) {
          write(answer.slice(index, index + 24));
          await delay(5);
        }
        return;
      }
      write("Der schnelle braune Fuchs springt über den faulen Hund.");
    },
  });
  const { browser, fixture, url } = session;
  const lastRequest = () =>
    fixture.requests.filter((request) => request.url.startsWith("/v1/")).at(-1);
  const run = async (selector, action) => {
    await poll(async () => {
      await selectText(page, selector);
      return (await barState(page)) === "toolbar";
    });
    await clickInBar(page, `[aria-label="${action}"]`);
    await poll(async () =>
      inSmartBar(page, (root) =>
        root
          ?.querySelector(".smart-bar-result-actions")
          ?.textContent.includes("Stop")
          ? false
          : !!root?.querySelector('[aria-label="Copy"]'),
      ),
    );
  };
  const card = () =>
    inSmartBar(page, (root) => {
      const entry = root?.querySelector(".smart-bar-dictionary");
      if (!entry) return undefined;
      const text = (selector) =>
        [...entry.querySelectorAll(selector)].map((item) =>
          item.textContent.trim(),
        );
      const children = [...entry.children];
      return {
        headword: text(".smart-bar-dictionary-headword")[0],
        tag: text(".smart-bar-dictionary-tag")[0],
        senses: text(".smart-bar-dictionary-senses > li"),
        inContext: text("li[data-in-context]").length,
        examples: text(".smart-bar-dictionary-example"),
        // The entry alone: no second translation under it.
        plainTranslation: /happy accident$/.test(entry.textContent.trim()),
      };
    });
  let page;
  try {
    page = await browser.open(url("/page"));

    await t.test("Translate on a word shows a dictionary entry", async () => {
      await run("#word", "Translate");
      const shown = await card();
      assert.ok(shown, "the card shows");
      assert.equal(shown.headword, "serendipity");
      assert.equal(shown.tag, "noun");
      assert.equal(shown.senses.length, 2);
      assert.equal(shown.inContext, 1);
      assert.match(shown.senses[0], /a lucky chance meeting/);
      assert.deepEqual(shown.examples, [
        "Finding that café was pure serendipity.",
      ]);
      assert.equal(shown.plainTranslation, false);
      const request = lastRequest();
      assert.match(JSON.stringify(request.body), /dictionary entry/);
      // The page around the word went along, for the meaning in context.
      assert.match(JSON.stringify(request.body), /to meet her/);
      // The bar knew the word's language, on its first run in the frame
      // too: the entry language is fixed, not left to the model.
      assert.match(
        JSON.stringify(request.body),
        /The entry language is English\. /,
      );
      assert.doesNotMatch(JSON.stringify(request.body), /unless the selected/);
    });

    await t.test(
      "a word in another language gets the reply language",
      async () => {
        await run("#chinese", "Translate");
        // English UI, Chinese word: the entry is in the reply language.
        assert.match(
          JSON.stringify(lastRequest().body),
          /The entry language is American English\. /,
        );
      },
    );

    await t.test("an answer that is no entry shows as text", async () => {
      await run("#broken", "Translate");
      assert.equal(await card(), undefined);
      assert.equal((await resultText(page)).trim(), "short-lived");
    });

    await t.test("Explain on a word is unchanged", async () => {
      await run("#word", "Explain");
      assert.equal(await card(), undefined);
      assert.equal((await resultText(page)).trim(), "A happy accident.");
      assert.doesNotMatch(JSON.stringify(lastRequest().body), /dictionary/);
      // The answer can be selected; the buttons around it cannot.
      assert.deepEqual(
        await inSmartBar(page, (root) =>
          [".smart-bar-result-text", ".smart-bar-result button"].map(
            (selector) =>
              getComputedStyle(root.querySelector(selector)).userSelect,
          ),
        ),
        ["text", "none"],
      );
    });

    await t.test("Translate on a sentence is unchanged", async () => {
      await run("#sentence", "Translate");
      assert.equal(await card(), undefined);
      assert.match(await resultText(page), /schnelle braune Fuchs/);
      assert.match(
        JSON.stringify(lastRequest().body),
        /Translate the text below into/,
      );
    });
  } finally {
    await session.close();
  }
});
