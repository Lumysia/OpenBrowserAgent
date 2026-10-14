import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  barAfterSelection,
  barHas,
  barState,
  clickInBar,
  fieldValue,
  inSmartBar,
  pressKey,
  resultText,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// Results: streaming into the card, written back into fields, and the keys
// the bar takes from the page while it shows.
const PAGE = `<!doctype html><html lang="en"><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p,textarea,input,div{display:block;width:420px;margin:0 0 24px}</style>
<p id="text">The quick brown fox jumps over the lazy dog.</p>
<textarea id="area" rows="2">hello wrold</textarea>
<div id="editor" contenteditable="true">teh draft</div>
<input id="controlled" value="recieve">
<input id="password" type="password" value="secretpassword">
<input id="suggest" value="hello wrold">
<h2 id="heading">Top stories <span>&gt;</span></h2>
<ul id="suggestions" hidden><li>hello world</li></ul>
<dialog id="dialog"><p id="dialog-text">Text in a modal dialog.</p></dialog>
<script>
  // Like a framework-controlled input: state follows input events only.
  window.inputEvents = 0;
  window.controlledState = "recieve";
  document.getElementById("controlled").addEventListener("input", (event) => {
    window.inputEvents++;
    window.controlledState = event.target.value;
  });
  // A suggestion dropdown that closes on any press outside the field and
  // leaves the caret at the end, as many sites' search boxes do.
  const suggest = document.getElementById("suggest");
  suggest.addEventListener("focus", () => (suggestions.hidden = false));
  document.addEventListener(
    "mousedown",
    (event) => {
      if (event.target === suggest || suggestions.hidden) return;
      suggestions.hidden = true;
      suggest.setSelectionRange(suggest.value.length, suggest.value.length);
    },
    true,
  );
  // The page's own Esc handling, like a form or menu would have.
  window.escapes = 0;
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.escapes++;
  });
</script>`;

const FIXES = {
  "hello wrold": "hello world",
  "teh draft": "the draft",
  recieve: "receive",
};

test("smart bar editing", { timeout: BROWSER_TEST_TIMEOUT }, async (t) => {
  let release;
  const released = new Promise((resolve) => (release = resolve));
  const session = await startSmartBar({
    pages: { "/page": PAGE },
    smartBar: { enabled: true },
    answer: async (prompt, write) => {
      const fixed = Object.entries(FIXES).find(([wrong]) =>
        prompt.includes(`\\n${wrong}\\n`),
      );
      if (fixed) return write(fixed[1]);
      // Explain: the second half waits for the test, proving the card
      // shows text while the answer still streams.
      write("Streamed explanation");
      await released;
      write(" finished.");
    },
  });
  const { browser, fixture, url } = session;
  try {
    const page = await browser.open(url("/page"));

    await t.test("Explain streams the fixture answer", async () => {
      await poll(async () => {
        await selectText(page, "#text");
        return (await barState(page)) === "toolbar";
      });
      await clickInBar(page, '[aria-label="Explain"]');
      await poll(async () =>
        (await resultText(page)).includes("Streamed explanation"),
      );
      assert.equal(await barHas(page, "button", "Stop"), true);
      release();
      await poll(async () =>
        (await resultText(page)).includes("Streamed explanation finished."),
      );
      const explain = fixture.requests.find((request) =>
        JSON.stringify(request.body).includes("Explain the text below"),
      );
      assert.match(
        JSON.stringify(explain.body),
        /The quick brown fox jumps over the lazy dog\./,
      );
    });

    await t.test("the result card fits its text and reads aloud", async () => {
      const card = () =>
        inSmartBar(page, (root) => ({
          width: root.querySelector(".smart-bar-result").offsetWidth,
          labels: [...root.querySelectorAll(".smart-bar-result button")].map(
            (item) => item.getAttribute("aria-label"),
          ),
        }));
      const { width, labels } = await card();
      // The explanation is short: narrower than the card's maximum.
      assert.ok(width < 380, `card is ${width}px wide`);
      assert.ok(labels.includes("Read original aloud"));
      assert.ok(labels.includes("Read result aloud"));
      // Headless Chromium refuses to speak: the button shows it reads, then
      // returns to idle when the voice ends or fails.
      await clickInBar(page, '[aria-label="Read result aloud"]');
      await poll(async () => {
        const now = (await card()).labels;
        return (
          now.includes("Read original aloud") &&
          now.includes("Read result aloud")
        );
      });
    });

    for (const [selector, kind] of [
      ["#area", "textarea"],
      ["#editor", "contenteditable"],
    ])
      await t.test(`Replace in a ${kind}, undone by Ctrl+Z`, async () => {
        const before = await fieldValue(page, selector);
        await replaceWithFix(page, selector);
        assert.equal(await fieldValue(page, selector), FIXES[before]);
        await pressKey(page, "z", { modifiers: 2, commands: ["undo"] });
        await poll(async () => (await fieldValue(page, selector)) === before);
      });

    for (const [selector, kind] of [
      ["#area", "textarea"],
      ["#editor", "contenteditable"],
    ])
      await t.test(`no Replace in a ${kind} edited meanwhile`, async () => {
        const before = await fieldValue(page, selector);
        await selectText(page, selector);
        await poll(async () => (await barState(page)) === "toolbar");
        await clickInBar(page, '[aria-label="Fix spelling & grammar"]');
        await poll(() => barHas(page, "button", "Replace"));
        // The field kept focus: the user types before the selection, the
        // same text even, so the old place holds the selected text again.
        await pressKey(page, "Home");
        await page.send("Input.insertText", { text: before });
        await clickInBar(page, "button", "Replace");
        await poll(() =>
          barHas(
            page,
            ".smart-bar-result-notice",
            "The selected text changed. Copy the result instead.",
          ),
        );
        assert.equal(await fieldValue(page, selector), before + before);
        assert.equal(await barHas(page, "button", "Replace"), false);
        await pressKey(page, "Escape");
        await page.call(
          ({ selector, before }) => {
            const element = document.querySelector(selector);
            if ("value" in element) element.value = before;
            else element.textContent = before;
          },
          { selector, before },
        );
      });

    await t.test("a controlled input gets an input event", async () => {
      await replaceWithFix(page, "#controlled");
      assert.deepEqual(
        await page.call(() => [window.controlledState, window.inputEvents > 0]),
        ["receive", true],
      );
    });

    await t.test("no bar in password fields", async () => {
      assert.equal(await barAfterSelection(session, page, "#password"), "none");
    });

    await t.test(
      "a field whose dropdown closes on the bar's click",
      async () => {
        await replaceWithFix(page, "#suggest");
        assert.equal(await fieldValue(page, "#suggest"), "hello world");
      },
    );

    await t.test("Esc hides the bar, not the page's dialog", async () => {
      await page.call(() => document.getElementById("dialog").showModal());
      await selectText(page, "#dialog-text");
      await poll(async () => (await barState(page)) === "toolbar");
      const escapes = await page.call(() => window.escapes);
      await pressKey(page, "Escape");
      await poll(async () => (await barState(page)) === "none");
      assert.equal(await page.call(() => dialog.open), true);
      assert.equal(await page.call(() => window.escapes), escapes);
      // With no bar, Esc is the page's again.
      await pressKey(page, "Escape");
      await poll(() => page.call(() => !dialog.open));
      assert.equal(await page.call(() => window.escapes), escapes + 1);
    });

    await t.test("the too-long notice uses the UI language", async () => {
      await session.options.call(() =>
        chrome.storage.local.set({ language: "de-DE" }),
      );
      await page.call(() => {
        const area = document.getElementById("area");
        area.value = "x".repeat(20001);
        area.focus();
        area.select();
      });
      // What the background sends for the keyboard command.
      await session.options.call(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.sendMessage(tab.id, {
          type: "smart-bar:show-for-selection",
        });
      }, url("/page"));
      await poll(async () => (await barState(page)) === "toolbar");
      // Improve, the first action for fields.
      await clickInBar(page, '[role="toolbar"] button');
      await poll(async () => (await resultText(page)).includes("20.000"));
    });

    await t.test("the background refuses too-long text as well", async () => {
      const requests = fixture.requests.length;
      const event = await session.options.call(
        () =>
          new Promise((resolve) => {
            const port = chrome.runtime.connect({ name: "smart-bar-stream" });
            port.onMessage.addListener(resolve);
            port.postMessage({
              type: "run",
              action: "improve",
              text: "x".repeat(20001),
            });
          }),
      );
      assert.equal(event.type, "error");
      assert.equal(fixture.requests.length, requests);
    });

    await t.test("a cut-off selection is sent with its context", async () => {
      await session.options.call(() =>
        chrome.storage.local.set({ language: "en-US" }),
      );
      // "Top st" of "Top stories", as a quick drag leaves it.
      await page.call(() => {
        document.activeElement?.blur();
        const text = document.getElementById("heading").firstChild;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, 6);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      });
      await session.options.call(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        await chrome.tabs.sendMessage(tab.id, {
          type: "smart-bar:show-for-selection",
        });
      }, url("/page"));
      await poll(async () => (await barState(page)) === "toolbar");
      const requests = fixture.requests.length;
      await clickInBar(page, '[aria-label="Explain"]');
      await poll(() => fixture.requests.length > requests);
      const body = JSON.stringify(fixture.requests[requests].body);
      assert.match(body, /<text>\\nTop st\\n<\/text>/);
      assert.match(body, /Page title: Smart bar/);
      // The rest of the word right after the selection, page text around it.
      assert.match(body, /\[\[SELECTION\]\]ories > /);
      assert.match(body, /lazy dog/);
      // Not field values or script text.
      assert.doesNotMatch(body, /secretpassword|hello wrold|inputEvents/);
      await pressKey(page, "Escape");
    });

    await t.test("replies use the extension's language setting", async () => {
      await session.options.call(() =>
        chrome.storage.local.set({ language: "zh-CN" }),
      );
      const requests = fixture.requests.length;
      const event = await session.options.call(
        () =>
          new Promise((resolve) => {
            const port = chrome.runtime.connect({ name: "smart-bar-stream" });
            port.onMessage.addListener((event) => {
              if (event.type !== "delta") resolve(event);
            });
            port.postMessage({
              type: "run",
              action: "translate",
              text: "Good morning! How are you today?",
            });
          }),
      );
      assert.equal(event.type, "done");
      const body = JSON.stringify(fixture.requests[requests].body);
      assert.match(body, /Translate the text below into Chinese \(China\)/);
    });
  } finally {
    release();
    await session.close();
  }
});

async function replaceWithFix(page, selector) {
  await selectText(page, selector);
  await poll(async () => (await barState(page)) === "toolbar");
  await clickInBar(page, '[aria-label="Fix spelling & grammar"]');
  await poll(() => barHas(page, "button", "Replace"));
  // Clicking the bar left the focus in the field.
  assert.equal(
    await page.call(
      (selector) => document.activeElement === document.querySelector(selector),
      selector,
    ),
    true,
  );
  await clickInBar(page, "button", "Replace");
  await poll(async () => (await barState(page)) === "none");
}
