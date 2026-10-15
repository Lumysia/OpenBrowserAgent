import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import {
  fixtureTranslator,
  startPageTranslate,
} from "./page-translate-fixture.mjs";

// A release log of cards, each one link: a short title, platform tags, and
// a teaser ending in a "Read more" the page sets on a line of its own. The
// browser's built-in translator is faked in the background like Chrome's:
// it reads sentences right but takes short titles for other languages,
// some with confidence, and has no pair for those languages.
const VERSIONS = ["7.06", "7.05", "7.04", "7.03.1", "7.03", "7.02", "7.01"];

const card = (version) => `
<div class="cell"><a class="card" href="/notes/${version}/"><div class="content">
  <h2>Harbor - ${version}</h2>
  <ul class="tags"><li><div class="tag">PC</div></li><li><div class="tag">PS5</div></li></ul>
  <p> Patch ${version} contains gameplay and stability fixes.<br />
    <span class="more">Read more</span>
  </p>
</div></a></div>`;

const page = `<!doctype html><html lang="en-GB"><head><title>Release log</title>
<style>
body{font:16px/1.5 sans-serif;margin:0;background:#101418;color:#ddd}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1100px;margin:auto}
.card{color:inherit;text-decoration:none;display:block}
.content{min-height:420px;padding:24px;background:#000}
.tags{list-style:none;padding:0;display:flex;gap:6px}
.tag{display:inline-block;padding:4px 10px;background:#c43}
.more{display:block;position:relative;padding-top:24px;text-transform:uppercase;color:#c43}
.more::after{content:"";position:absolute;left:-12px;bottom:-5px;width:100%;height:1px;background:#c43}
</style></head><body><main>
<h1>Release log</h1>
<div class="grid">${VERSIONS.map(card).join("")}</div>
</main></body></html>`;

test(
  "page translation of a list of cards with the built-in translator",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startPageTranslate({
      pages: { "/log": page },
      answer: fixtureTranslator(),
      preferences: {
        pageTranslate: { engine: "browser", targetLanguage: "zh-CN" },
      },
    });
    const { browser, url, clickMenu, worker } = session;
    try {
      await worker.call(() => {
        const misread = [
          { detectedLanguage: "la", confidence: 0.8 },
          { detectedLanguage: "it", confidence: 0.4 },
        ];
        let titles = 0;
        self.LanguageDetector = {
          availability: async () => "available",
          create: async () => ({
            detect: async (text) => [
              /^Harbor - [\d.]+$/.test(text)
                ? misread[titles++ % misread.length]
                : { detectedLanguage: "en", confidence: 0.9 },
            ],
          }),
        };
        self.Translator = {
          availability: async ({ sourceLanguage }) =>
            /^en\b/.test(sourceLanguage) ? "available" : "unavailable",
          create: async () => ({ translate: async (text) => `ZH: ${text}` }),
        };
      });
      const pageUrl = url("/log");
      const tab = await browser.open(pageUrl);
      await tab.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 1400,
        deviceScaleFactor: 1,
        mobile: false,
      });
      // Translations taken out again after they showed.
      await tab.call(() => {
        window.removedTranslations = 0;
        new MutationObserver((records) => {
          for (const record of records)
            for (const node of record.removedNodes)
              if (node.localName === "oba-translation")
                window.removedTranslations++;
        }).observe(document.body, { childList: true, subtree: true });
      });
      await clickMenu(pageUrl);
      const cards = () =>
        tab.call(() =>
          [...document.querySelectorAll(".card")].map((card) => {
            const title = card.querySelector("h2 > oba-translation");
            const teaser = card.querySelector("p > oba-translation");
            const more = card.querySelector(".more + oba-translation");
            return {
              title: title?.textContent,
              teaser: teaser?.textContent,
              // What the teaser's translation sits between.
              around: teaser && [
                teaser.previousSibling?.nodeName,
                teaser.nextElementSibling?.className,
              ],
              more: more?.textContent,
              // The title's, the teaser's and "Read more"'s. The platform
              // tags are sent too: a link's text alone isn't a name.
              translations: card.querySelectorAll(
                ":not(.tag) > oba-translation",
              ).length,
            };
          }),
        );
      const shown = await poll(async () => {
        const all = await cards();
        return all.every((card) => card.title && card.teaser && card.more)
          ? all
          : undefined;
      });
      for (const [index, version] of VERSIONS.entries())
        assert.deepEqual(shown[index], {
          // Every title by the built-in translator: one it misread didn't
          // stop it or hand the page to the AI model.
          title: `ZH: Harbor - ${version}`,
          // The teaser's translation under its text, before "Read more",
          // without a second "Read more" in it.
          teaser: `ZH: Patch ${version} contains gameplay and stability fixes.`,
          around: ["BR", "more"],
          more: "ZH: Read more",
          translations: 3,
        });
      assert.equal(await tab.call(() => window.removedTranslations), 0);
    } finally {
      await session.close();
    }
  },
);
