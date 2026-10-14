import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

// Input that needs a real browser: native dialogs, trusted (debugger) input,
// tab groups and full-page capture.
const PAGES = {
  "/page": "<title>Page</title><p>Some text</p>",
  "/shadow": "<title>Shadow</title><p>Another page</p>",
  "/dialog": `<title>Dialog</title><button onclick="window.answer=confirm('Sure?')">Delete</button>`,
  "/alert": `<title>Alert</title><p>Alerting</p><script>setTimeout(() => alert("hi"), 200)</script>`,
  "/trusted": `<title>Trusted</title>
<button id="real" style="position:fixed;left:10px;top:10px;width:120px;height:40px" onclick="if (event.isTrusted) window.realClicks = (window.realClicks || 0) + 1" ondblclick="window.double = (window.double || 0) + 1">Real only</button>
<input id="keys" style="position:fixed;left:10px;top:80px" onkeydown="if (event.isTrusted) window.typed = (window.typed || '') + event.key">`,
};

test(
  "dialogs, trusted input and tabs",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const fixture = await browserToolFixture((request, response) => {
      if (!PAGES[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(PAGES[request.url]);
      return true;
    });
    const { page, open, evaluate } = fixture;
    try {
      const tabId = await open("/page");

      await t.test(
        "dialogs are answered and reported; a blocked tab stalls nothing else",
        async () => {
          const dialogTab = await open("/dialog");
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId: dialogTab } },
          ]);
          const button = ref(snapshot, 'button "Delete"');
          const click = { action: "click", ref: button };
          const [dismissed, accepted] = await fixture.run([
            { name: "act", args: { tabId: dialogTab, steps: [click] } },
            {
              name: "act",
              args: {
                tabId: dialogTab,
                steps: [{ action: "dialog", value: "accept" }, click],
              },
            },
          ]);
          assert.match(dismissed, /Dialog confirm "Sure\?": dismissed\./);
          assert.match(accepted, /Dialog confirm "Sure\?": accepted\./);
          assert.equal(await evaluate(dialogTab, "window.answer"), true);
          assert.equal(
            await evaluate(
              dialogTab,
              "window.confirm === Window.prototype.confirm || String(window.confirm).includes('native code')",
            ),
            true,
          );
          const alerting = await open("/alert");
          await new Promise((resolve) => setTimeout(resolve, 500));
          const started = Date.now();
          const [blocked, other] = await fixture.run([
            { name: "snapshot", args: { tabId: alerting } },
            { name: "read", args: { source: `tab:${dialogTab}` } },
          ]);
          assert.match(blocked, /is not responding: a JavaScript dialog/);
          assert.match(other, /characters 0-/);
          assert.ok(Date.now() - started < 20_000);
          await page.call(
            (ids) => chrome.tabs.remove(ids),
            [dialogTab, alerting],
          );
        },
      );

      await t.test(
        "trusted steps send real input; double-clicks work either way",
        async () => {
          const trustedTab = await open("/trusted");
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId: trustedTab } },
          ]);
          const button = ref(snapshot, 'button "Real only"');
          const keys = ref(snapshot, "textbox");
          const [acted] = await fixture.run([
            {
              name: "act",
              args: {
                tabId: trustedTab,
                steps: [
                  { action: "click", ref: button },
                  { action: "click", ref: button, trusted: true },
                  { action: "click", x: 70, y: 30 },
                  { action: "click", ref: button, double: true },
                  { action: "press", ref: keys, key: "a", trusted: true },
                ],
              },
            },
          ]);
          assert.match(acted, /Done: 1\. click.*5\. press a/s);
          assert.deepEqual(
            await evaluate(
              trustedTab,
              "[window.realClicks, window.double, window.typed]",
            ),
            [2, 1, "a"],
          );
          await page.call((id) => chrome.tabs.remove(id), trustedTab);
        },
      );

      await t.test(
        "tabs are searched and grouped; a full page is captured",
        async () => {
          const other = await open("/shadow");
          const [found, grouped, listed, ungrouped, shot] = await fixture.run([
            {
              name: "tabs",
              args: { action: "list", query: "shadow 127.0.0.1" },
            },
            {
              name: "tabs",
              args: {
                action: "group",
                tabIds: [tabId, other],
                title: "Research",
                color: "blue",
              },
            },
            { name: "tabs", args: { action: "list", query: "127.0.0.1" } },
            {
              name: "tabs",
              args: { action: "ungroup", tabIds: [tabId, other] },
            },
            { name: "screenshot", args: { tabId, fullPage: true } },
          ]);
          assert.equal(found.split("\n").length, 1);
          assert.match(found, new RegExp(`tab ${other}.*Shadow`));
          assert.match(grouped, /Grouped tab .* as "Research"/);
          assert.match(listed, /\[group: Research\]: Shadow/);
          assert.match(ungrouped, /Ungrouped/);
          assert.match(shot, /Full-page screenshot of tab \d+ .*\d+x\d+ px/);
          assert.equal(
            await page.call(
              async (id) => (await chrome.tabs.get(id)).groupId,
              other,
            ),
            -1,
          );
          await page.call((id) => chrome.tabs.remove(id), other);
        },
      );
    } finally {
      await fixture.close();
    }
  },
);
