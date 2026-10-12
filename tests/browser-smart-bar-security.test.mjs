import assert from "node:assert/strict";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import {
  barState,
  clickAway,
  inSmartBar,
  clickInBar,
  resultText,
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
  // Custom elements belong to the document, not to a script world: one named
  // like the bar would run the page's code on the extension's element and
  // hand the page its closed root through ElementInternals.
  window.customElementLog = [];
  customElements.define("oba-smart-bar", class extends HTMLElement {
    constructor() {
      super();
      window.customElementLog.push("constructed");
      window.internals = this.attachInternals();
    }
  });
  window.readBar = () =>
    window.internals?.shadowRoot?.querySelector(".smart-bar-result-text")
      ?.textContent ?? null;
  // Every shadow root the page can reach.
  window.reachableRoots = () =>
    [...document.querySelectorAll("*")].filter((element) => element.shadowRoot)
      .length;
</script>`;

// The async clipboard is turned off by the page's own permissions policy, so
// Copy takes the fallback; the page records what its copy listeners see.
const COPY_PAGE = {
  headers: { "Permissions-Policy": "clipboard-write=()" },
  html: `<!doctype html><title>Copy</title>
<textarea id="area" rows="2">hello wrold</textarea>
<script>
  window.copies = [];
  const record = (event) => {
    const read = () => ({
      selection: String(getSelection()),
      data: event.clipboardData.getData("text/plain"),
    });
    window.copies.push(read());
    // Also once the other listeners ran.
    queueMicrotask(() => window.copies.push(read()));
    setTimeout(() => window.copies.push(read()));
  };
  addEventListener("copy", record, true);
  document.addEventListener("copy", record, true);
  window.fieldState = () => {
    const area = document.getElementById("area");
    return [document.activeElement === area, area.selectionStart, area.selectionEnd];
  };
</script>`,
};

test("smart bar security", { timeout: 240000 }, async (t) => {
  const session = await startSmartBar({
    pages: { "/page": PAGE, "/copy": COPY_PAGE },
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
          return window.reachableRoots();
        }, browser.id);
        assert.equal(reached, 0);
        assert.equal(await barState(page), "none");
        // The user's own selection still works, and the page can't reach in.
        await selectText(page, "#text");
        await poll(async () => (await barState(page)) === "toolbar");
        assert.equal(await page.call(() => window.reachableRoots()), 0);
        assert.equal(fixture.requests.length, requests);
        assert.equal(await page.call(() => window.extensionMessages), 0);
      },
    );

    await t.test("a page's custom element can't read the results", async () => {
      await clickInBar(page, '[aria-label="Explain"]');
      await poll(async () =>
        (await resultText(page)).includes("SECRET_MODEL_OUTPUT"),
      );
      assert.equal(await page.call(() => window.readBar()), null);
      assert.deepEqual(await page.call(() => window.customElementLog), []);
    });

    await t.test(
      "Copy without the clipboard API shows the page nothing",
      async () => {
        const copyPage = await browser.open(url("/copy"));
        await poll(async () => {
          await selectText(copyPage, "#area");
          return (await barState(copyPage)) === "toolbar";
        });
        await clickInBar(copyPage, '[aria-label="Fix spelling & grammar"]');
        await poll(async () =>
          (await resultText(copyPage)).includes("SECRET_MODEL_OUTPUT"),
        );
        const field = await copyPage.call(() => window.fieldState());
        await clickInBar(copyPage, '.smart-bar-result [aria-label="Copy"]');
        await poll(() =>
          inSmartBar(
            copyPage,
            (root) => !!root?.querySelector('[aria-label="Copied"]'),
          ),
        );
        const copies = await copyPage.call(() => window.copies);
        assert.ok(
          copies.every(
            ({ selection, data }) =>
              !`${selection}${data}`.includes("SECRET_MODEL_OUTPUT"),
          ),
        );
        // The user's selection and focus stay where they were.
        assert.deepEqual(await copyPage.call(() => window.fieldState()), field);
        assert.equal(await readClipboard(session), "SECRET_MODEL_OUTPUT");
      },
    );
  } finally {
    await session.close();
  }
});

// Through an extension page, which may read the clipboard.
async function readClipboard({ browser, options, extensionUrl }) {
  await browser.browser.send("Browser.grantPermissions", {
    origin: extensionUrl("").slice(0, -1),
    permissions: ["clipboardReadWrite"],
  });
  await options.send("Page.bringToFront");
  return options.call(() => navigator.clipboard.readText());
}
