import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { poll } from "./chromium.mjs";
import {
  fixtureTranslator,
  startPageTranslate,
} from "./page-translate-fixture.mjs";

// Content in the page's interface is translated, its short labels aren't:
// a page without an article (a header with a pitch, a footer, a dialog laid
// over the page at load, a sentence with a button in it, a quiz, questions
// in a tab list, a carousel), and a guide with an article (a table of
// contents and a column fixed beside it, a note fixed over it, link titles,
// numbers, boxed headlines next to a pill).
const edges = `<!doctype html><html lang="en"><head><title>Edges</title>
<style>
body{font:16px/1.5 sans-serif;margin:0;background:#fff;color:#222}
.site,.body,footer{max-width:640px;margin:auto;padding:8px}
.choice{display:block;padding:8px;border:1px solid #999;margin:4px 0;cursor:pointer}
.tabs{display:flex;gap:8px}
.tabs [role=tab]{display:inline-block;padding:6px 10px;border:1px solid #999}
.slide[aria-hidden=true]{display:none}
.modal{position:fixed;top:120px;left:50%;width:320px;margin-left:-160px;padding:16px;background:#fff;border:1px solid #333;box-sizing:border-box}
.modal button{padding:4px 12px}
</style></head><body>
<header class="site">
  <a id="logo" href="/">Acme</a>
  <h1 id="hero">Build faster websites today</h1>
  <p id="pitch">A toolkit that helps small teams ship their sites quickly.</p>
</header>
<div class="body">
  <p id="press">Press <button id="save">Save</button> to keep your changes.</p>
  <div role="radiogroup">
    <div role="radio" class="choice" id="answer">I play mostly on weekends with friends</div>
    <div role="radio" class="choice" id="daily">Daily</div>
  </div>
  <div role="tablist" class="tabs">
    <div role="tab" id="question">Do I need an account to play?</div>
    <div role="tab" id="pricing">Pricing</div>
  </div>
  <div class="carousel">
    <div class="slide" id="first"><h3>The first slide of the tour</h3></div>
    <div class="slide" id="second" aria-hidden="true"><h3>The second slide of the tour</h3></div>
    <button id="next">Next</button>
  </div>
</div>
<footer>
  <p id="disclaimer">This site is not affiliated with anyone and offers no warranty.</p>
  <p id="copyright">© 2026 Example Inc.</p>
</footer>
<div role="dialog" aria-modal="true" class="modal" id="dialog">
  <h2 id="dialog-title">What's new in version three</h2>
  <p id="dialog-text">You can now share boards with your whole team, and every board keeps its history.</p>
  <button id="accept">Accept</button>
</div>
<script>
document.querySelector("#save").addEventListener("click", () => (document.body.dataset.saved = "yes"));
document.querySelector("#accept").addEventListener("click", () => (document.querySelector("#dialog").hidden = true));
document.querySelector("#next").addEventListener("click", () => {
  document.querySelector("#first").setAttribute("aria-hidden", "true");
  document.querySelector("#second").setAttribute("aria-hidden", "false");
});
</script>
</body></html>`;

const guide = `<!doctype html><html lang="en"><head><title>Guide</title>
<style>
body{font:16px/1.5 sans-serif;margin:0;background:#fff;color:#222}
main{margin:0 240px;min-height:100vh;padding:8px}
.toc{position:fixed;left:0;top:0;width:200px;padding:8px}
.side{position:fixed;right:0;top:0;width:200px;padding:8px}
.bar{position:fixed;left:0;right:0;bottom:0;padding:8px;background:#eee}
.related{list-style:none;padding:0}
.boxed{display:block;border:1px solid #999;padding:8px}
.pill{display:inline-block;padding:2px 8px;border-radius:9px;background:#ddd}
</style></head><body>
<nav class="toc" aria-label="On this page"><ul>
  <li><a id="toc-build" href="#build">How to configure the build</a></li>
  <li><a id="toc-install" href="#install">Installation</a></li>
  <li><a id="toc-home" href="/">Home</a></li>
</ul></nav>
<main>
  <h2 id="build">How to configure the build</h2>
  <p>Run the build with the production flag set.</p>
  <h2 id="install">Installation</h2>
  <p><a id="headline" href="/x">Cross-Save Is Here</a></p>
  <p id="episode">Ep 12: The End</p>
  <p id="price">$24.99</p>
  <div class="byline"><a rel="author" id="author" href="/ann">Ann Lee</a></div>
  <ul class="related"><li><a class="boxed" id="story" href="/s">Storm closes northern pass</a></li></ul>
  <p><a class="pill" id="pill" href="/docs">Docs</a></p>
</main>
<div class="side"><div id="side-label">Quick tips</div></div>
<div class="bar"><p id="bar-text">We use cookies to remember your settings.</p><div id="bar-label">Got it</div></div>
</body></html>`;

// The translation of the element `selector`: our element in it or right
// after it, or its tooltip.
function translations(tab, ids) {
  return tab.call(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => {
          const element = document.getElementById(id);
          const next = element.nextSibling;
          const own =
            element.querySelector("oba-translation") ??
            (next?.localName === "oba-translation" ? next : null);
          return [
            id,
            own?.textContent ?? element.getAttribute("title") ?? null,
          ];
        }),
      ),
    ids,
  );
}

async function open(session, path) {
  const { browser, url, clickMenu } = session;
  const pageUrl = url(path);
  const tab = await browser.open(pageUrl);
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await clickMenu(pageUrl);
  return tab;
}

test(
  "page translation of content in the page's interface",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const sent = [];
    const session = await startPageTranslate({
      pages: { "/edges": edges, "/guide": guide },
      answer: fixtureTranslator(sent),
    });
    try {
      const tab = await open(session, "/edges");
      const content = {
        hero: "FR: Build faster websites today",
        pitch: "FR: A toolkit that helps small teams ship their sites quickly.",
        press: "FR: Press Save to keep your changes.",
        answer: "FR: I play mostly on weekends with friends",
        question: "FR: Do I need an account to play?",
        disclaimer:
          "FR: This site is not affiliated with anyone and offers no warranty.",
        "dialog-title": "FR: What's new in version three",
        "dialog-text":
          "FR: You can now share boards with your whole team, and every board keeps its history.",
      };
      const labels = [
        "logo",
        "save",
        "daily",
        "pricing",
        "next",
        "copyright",
        "accept",
      ];
      const shown = await poll(async () => {
        const all = await translations(tab, Object.keys(content));
        return Object.values(all).every(Boolean) ? all : undefined;
      });
      assert.deepEqual(shown, content);
      assert.deepEqual(
        Object.values(await translations(tab, labels)),
        labels.map(() => null),
      );
      // Nothing overflows the dialog or its button.
      assert.deepEqual(
        await tab.call(() => {
          const dialog = document
            .querySelector("#dialog")
            .getBoundingClientRect();
          const accept = document.querySelector("#accept");
          return {
            inside: [
              ...document.querySelectorAll("#dialog oba-translation"),
            ].every((translation) => {
              const box = translation.getBoundingClientRect();
              return (
                box.left >= dialog.left - 1 &&
                box.right <= dialog.right + 1 &&
                box.bottom <= dialog.bottom + 1
              );
            }),
            fits:
              accept.scrollWidth <= accept.clientWidth &&
              document.querySelector("#dialog").scrollWidth <=
                document.querySelector("#dialog").clientWidth,
          };
        }),
        { inside: true, fits: true },
      );
      // The button copied into the sentence's translation is the page's
      // button; the dialog's button still closes it.
      await tab.call(() =>
        document.querySelector("#press oba-translation button").click(),
      );
      await tab.call(() => document.querySelector("#accept").click());
      assert.deepEqual(
        await tab.call(() => ({
          saved: document.body.dataset.saved,
          closed: document.querySelector("#dialog").hidden,
        })),
        { saved: "yes", closed: true },
      );
      // The carousel's next slide is translated once it shows.
      await tab.call(() => document.querySelector("#next").click());
      assert.equal(
        await poll(() =>
          tab.call(
            () =>
              document.querySelector("#second h3 oba-translation")?.textContent,
          ),
        ),
        "FR: The second slide of the tour",
      );

      const docs = await open(session, "/guide");
      const guideContent = {
        "toc-build": "FR: How to configure the build",
        "toc-install": "FR: Installation",
        headline: "FR: Cross-Save Is Here",
        story: "FR: Storm closes northern pass",
        "side-label": "FR: Quick tips",
        "bar-text": "FR: We use cookies to remember your settings.",
      };
      const guideLabels = ["toc-home", "price", "author", "pill", "bar-label"];
      assert.deepEqual(
        await poll(async () => {
          const all = await translations(docs, Object.keys(guideContent));
          return Object.values(all).every(Boolean) ? all : undefined;
        }),
        guideContent,
      );
      assert.deepEqual(
        Object.values(await translations(docs, guideLabels)),
        guideLabels.map(() => null),
      );
      // Words around a number make it text. Its translation here only adds
      // the fixture's label and isn't shown (see addsLittle).
      const texts = sent.flat();
      assert.ok(texts.includes("Ep 12: The End"));
      assert.ok(!texts.includes("$24.99"));
    } finally {
      await session.close();
    }
  },
);
