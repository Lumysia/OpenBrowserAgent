import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import {
  fixtureTranslator,
  startPageTranslate,
} from "./page-translate-fixture.mjs";

// Questions and answers: each question a full-width button that opens its
// answer, with the same text in a visually hidden heading. Next to them,
// short buttons that are the page's interface.
const QUESTIONS = [
  ["account", "Do I have to connect more than one account to use it?"],
  ["saves", "How many saves can I upload?"],
  ["remove", "Can I remove a platform later?"],
];

const question = ([id, text]) => `
<div id="${id}" class="accordion open">
  <h3 class="visually-hidden">${text}</h3>
  <button class="accordion__title" data-target="#${id}">
    ${text}
  </button>
  <div class="accordion__body"><p>The answer to this question, in a sentence.</p></div>
</div>`;

const page = `<!doctype html><html lang="en"><head><title>Questions</title>
<style>
body{font:16px/1.5 sans-serif;margin:0;background:#101418;color:#ddd}
main{max-width:720px;margin:auto}
.accordion{border-bottom:2px solid #555}
.accordion__title{border:0;display:block;margin:0;padding:20px;position:relative;width:100%;background:transparent;font-size:24px;text-align:left;color:inherit;cursor:pointer}
.accordion__body{display:none;padding:0 20px 20px}
.accordion.open .accordion__body{display:block}
.visually-hidden{height:1px;overflow:hidden;position:absolute!important;width:1px;white-space:nowrap;clip:rect(1px,1px,1px,1px)}
</style></head><body>
<header><button id="login">Log in</button></header>
<main>
<h2>Questions</h2>
${QUESTIONS.map(question).join("")}
<button id="more">Read more</button>
</main>
<script>
for (const button of document.querySelectorAll(".accordion__title"))
  button.addEventListener("click", () =>
    document.querySelector(button.dataset.target).classList.toggle("open"));
</script>
</body></html>`;

test(
  "page translation of questions written in buttons",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startPageTranslate({
      pages: { "/faq": page },
      answer: fixtureTranslator(),
    });
    const { browser, url, clickMenu } = session;
    try {
      const pageUrl = url("/faq");
      const tab = await browser.open(pageUrl);
      await tab.send("Emulation.setDeviceMetricsOverride", {
        width: 1024,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await clickMenu(pageUrl);
      const questions = () =>
        tab.call(() =>
          [...document.querySelectorAll(".accordion__title")].map((button) => {
            const translation = button.querySelector(
              ":scope > oba-translation",
            );
            const range = document.createRange();
            range.selectNodeContents(button.firstChild);
            return {
              translation: translation?.textContent,
              answer:
                button.nextElementSibling.querySelector("oba-translation")
                  ?.textContent,
              // Under the question, inside the button, which still fits.
              below:
                !!translation &&
                translation.getBoundingClientRect().top >=
                  range.getBoundingClientRect().bottom - 1,
              fits: button.scrollWidth <= button.clientWidth,
            };
          }),
        );
      const shown = await poll(async () => {
        const all = await questions();
        return all.every((item) => item.translation && item.answer)
          ? all
          : undefined;
      });
      assert.deepEqual(
        shown,
        QUESTIONS.map(([, text]) => ({
          translation: `FR: ${text}`,
          answer: "FR: The answer to this question, in a sentence.",
          below: true,
          fits: true,
        })),
      );
      // Short buttons are the page's interface: left as they are.
      assert.deepEqual(
        await tab.call(() =>
          ["#login", "#more"].map(
            (selector) =>
              document
                .querySelector(selector)
                .parentElement.querySelectorAll(
                  `${selector} oba-translation, ${selector} + oba-translation`,
                ).length,
          ),
        ),
        [0, 0],
      );
      // A click on the translation is a click on its button: the answer
      // closes.
      const open = () =>
        tab.call(() => document.querySelector("#saves").className);
      await tab.call(() =>
        document
          .querySelector("#saves .accordion__title > oba-translation")
          .click(),
      );
      assert.equal(await open(), "accordion");
    } finally {
      await session.close();
    }
  },
);
