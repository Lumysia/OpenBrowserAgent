import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { poll } from "./chromium.mjs";
import {
  barHas,
  barState,
  clickInBar,
  fieldValue,
  pressKey,
  resultText,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";

// Results: streaming into the card, written back into fields, and the keys
// the bar takes from the page while it shows.
const PAGE = `<!doctype html><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p,textarea,input,div{display:block;width:420px;margin:0 0 24px}</style>
<p id="text">The quick brown fox jumps over the lazy dog.</p>
<textarea id="area" rows="2">hello wrold</textarea>
<div id="editor" contenteditable="true">teh draft</div>
<input id="controlled" value="recieve">
<input id="password" type="password" value="secretpassword">
<dialog id="dialog"><p id="dialog-text">Text in a modal dialog.</p></dialog>
<script>
  // Like a framework-controlled input: state follows input events only.
  window.inputEvents = 0;
  window.controlledState = "recieve";
  document.getElementById("controlled").addEventListener("input", (event) => {
    window.inputEvents++;
    window.controlledState = event.target.value;
  });
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

test("smart bar editing", { timeout: 240000 }, async (t) => {
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

    for (const [selector, kind] of [
      ["#area", "textarea"],
      ["#editor", "contenteditable"],
    ])
      await t.test(`Replace in a ${kind}, undone by Ctrl+Z`, async () => {
        const before = await fieldValue(page, selector);
        await replaceWithFix(page, selector);
        assert.equal(await fieldValue(page, selector), FIXES[before]);
        await pressKey(page, "z", "KeyZ", 90, 2, ["undo"]);
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
        await pressKey(page, "Home", "Home", 36);
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
        await pressKey(page, "Escape", "Escape", 27);
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
      await selectText(page, "#password");
      await delay(600);
      assert.equal(await barState(page), "none");
    });

    await t.test("Esc hides the bar, not the page's dialog", async () => {
      await page.call(() => document.getElementById("dialog").showModal());
      await selectText(page, "#dialog-text");
      await poll(async () => (await barState(page)) === "toolbar");
      const escapes = await page.call(() => window.escapes);
      await pressKey(page, "Escape", "Escape", 27);
      await poll(async () => (await barState(page)) === "none");
      assert.equal(await page.call(() => dialog.open), true);
      assert.equal(await page.call(() => window.escapes), escapes);
      // With no bar, Esc is the page's again.
      await pressKey(page, "Escape", "Escape", 27);
      await poll(() => page.call(() => !dialog.open));
      assert.equal(await page.call(() => window.escapes), escapes + 1);
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
