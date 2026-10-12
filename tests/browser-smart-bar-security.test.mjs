import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  barState,
  clickAway,
  selectText,
  startSmartBar,
} from "./smart-bar-page.mjs";

// What a page's own scripts can do to the bar: never open it, press its
// buttons or read what it shows.
const PAGE = `<!doctype html><title>Smart bar</title>
<style>body{font:16px/1.4 sans-serif;margin:20px}p{display:block;width:420px;margin:0 0 24px}</style>
<p id="text">The quick brown fox jumps over the lazy dog.</p>
<script>
  // Anything the extension announces to the page (posted to the window).
  window.extensionMessages = 0;
  addEventListener("message", (event) => {
    if (event.source === window) window.extensionMessages++;
  });
</script>`;

test("smart bar security", { timeout: 240000 }, async (t) => {
  const session = await startSmartBar({
    pages: { "/page": PAGE },
    smartBar: { enabled: true },
    answer: async (_prompt, write) => write("SECRET_MODEL_OUTPUT"),
  });
  const { browser, fixture, url } = session;
  try {
    const page = await browser.open(url("/page"));

    await t.test(
      "a page script can neither open nor reach the bar",
      async () => {
        await poll(async () => {
          await selectText(page, "#text");
          return (await barState(page)) === "toolbar";
        });
        await clickAway(page);
        const requests = fixture.requests.length;
        const reached = await page.call(async (extensionId) => {
          const wait = (ms) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          // A page dispatching WXT's own "newer script started" event must not
          // tear down the extension's listeners.
          document.dispatchEvent(
            new CustomEvent(
              `${extensionId}:smart-bar:wxt:content-script-started`,
              {
                detail: { contentScriptName: "smart-bar", messageId: "page" },
              },
            ),
          );
          getSelection().selectAllChildren(document.getElementById("text"));
          document.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true, button: 0 }),
          );
          await wait(600);
          return document.querySelector("oba-smart-bar")?.shadowRoot || null;
        }, browser.id);
        assert.equal(reached, null);
        assert.equal(await barState(page), "none");
        // The user's own selection still works, and the page can't reach in.
        await selectText(page, "#text");
        await poll(async () => (await barState(page)) === "toolbar");
        assert.equal(
          await page.call(
            () => document.querySelector("oba-smart-bar").shadowRoot,
          ),
          null,
        );
        assert.equal(fixture.requests.length, requests);
        assert.equal(await page.call(() => window.extensionMessages), 0);
      },
    );
  } finally {
    await session.close();
  }
});
