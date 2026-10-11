import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture } from "./browser-tool-fixture.mjs";
import { poll } from "./chromium.mjs";

// Real Chromium is the only place where scrolling, hit-testing, key default
// actions and inline handlers behave as they do for users.
const PAGE = `<meta name="viewport" content="width=device-width"><title>OBA tool fixture</title>
<style>html{scroll-behavior:smooth}body{height:2600px}</style>
<form onsubmit="event.preventDefault();window.submitted=(window.submitted||0)+1">
  <input id="input" data-ai-id="fixture-input" value="replace me">
</form>
<div id="target">x</div>
<div id="note" contenteditable="true">old</div>
<button onclick="window.saved=(window.saved||0)+1"><span>Save draft</span></button>
<a id="spa" href="/elsewhere" onclick="event.preventDefault();window.spa=1">Open</a>
<div style="height:2000px"></div>
<main tabindex="-1" style="display:block;height:600px" onclick="window.hit=window.hit||'main'">
  <input data-ai-id="far" onclick="window.hit='input'" style="margin:20px">
</main>`;

test(
  "production browser tools honor display and input contracts",
  { timeout: 120000 },
  async (t) => {
    const fixture = await browserToolFixture((request, response) => {
      if (request.url !== "/page") return false;
      response.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
      return true;
    });
    const { page } = fixture;
    try {
      const tab = await page.call(
        (url) => chrome.tabs.create({ url }),
        `${fixture.baseUrl}/page`,
      );
      await poll(() =>
        page.call(
          async (id) => (await chrome.tabs.get(id)).status === "complete",
          tab.id,
        ),
      );
      const targetId = await page.call(
        async (id) =>
          (await chrome.debugger.getTargets()).find(
            (target) => target.tabId === id,
          )?.id,
        tab.id,
      );
      const load = {
        name: "loadTools",
        args: {
          names: [
            "cdpTakeScreenshot",
            "cdpPage",
            "cdpInput",
            "cdpExecuteArbitraryJavaScript",
          ],
        },
      };
      const js = (code, selector = { tabId: tab.id }) => ({
        name: "cdpExecuteArbitraryJavaScript",
        args: { ...selector, code },
      });
      const cdp = (operation, args = {}) => ({
        name: "cdpPage",
        args: { tabId: tab.id, operation, ...args },
      });
      const input = (args) => ({
        name: "cdpInput",
        args: { tabId: tab.id, ...args },
      });
      const run = async (steps) => {
        const results = await fixture.run([load, ...steps]);
        for (const result of results)
          assert.equal(
            result.output.error,
            undefined,
            `${result.name}: ${result.output.error}`,
          );
        return results.slice(1).map((result) => result.output);
      };
      const attached = () =>
        page.call(
          async (id) =>
            (await chrome.debugger.getTargets()).find(
              (target) => target.id === id,
            )?.attached,
          targetId,
        );

      await t.test(
        "full-page screenshot covers the whole document",
        async () => {
          const [visible, full] = await run([
            {
              name: "captureVisibleTab",
              args: { tabId: tab.id, format: "png" },
            },
            {
              name: "cdpTakeScreenshot",
              args: { tabId: tab.id, format: "png", fullPage: true },
            },
          ]);
          const height = (image) =>
            Buffer.from(image.split(",")[1], "base64").readUInt32BE(20);
          assert.ok(height(full.image) >= 2600);
          assert.ok(height(full.image) > height(visible.image));
        },
      );

      await t.test(
        "emulation by targetId persists for the tab until reset",
        async () => {
          const metrics =
            "({width:innerWidth,dpr:devicePixelRatio,dark:matchMedia('(prefers-color-scheme: dark)').matches})";
          const out = await run([
            {
              name: "cdpPage",
              args: {
                targetId,
                operation: "emulate",
                viewport: "390x844x2,mobile",
                colorScheme: "dark",
              },
            },
            js(metrics),
            cdp("emulate", { reset: true }),
            js(metrics, { targetId }),
          ]);
          assert.deepEqual(out[1].value, { width: 390, dpr: 2, dark: true });
          assert.notEqual(out[3].value.width, 390);
          assert.equal(out[3].value.dpr, 1);
          assert.equal(await attached(), false);
        },
      );

      await t.test("keys select, type and submit like a user", async () => {
        const out = await run([
          {
            name: "mutatePage",
            args: {
              tabId: tab.id,
              operation: "click",
              target: { selector: "#input" },
            },
          },
          input({ operation: "key", key: "Control+A" }),
          input({ operation: "type", text: "replacement" }),
          input({ operation: "key", key: "Enter" }),
          js(
            "({value:document.querySelector('#input').value,submitted:window.submitted})",
          ),
        ]);
        assert.deepEqual(out[4].value, { value: "replacement", submitted: 1 });
      });

      await t.test(
        "click by id hits a far input under smooth scroll and a tabindex ancestor",
        async () => {
          const out = await run([
            input({ operation: "click", id: "far" }),
            js("window.hit"),
          ]);
          assert.equal(out[0].clickedTag, "input");
          assert.equal(out[1].value, "input");
        },
      );

      await t.test(
        "inspectPage and mutatePage find a control by its text",
        async () => {
          const target = { text: "save draft" };
          const out = await run([
            { name: "inspectPage", args: { tabId: tab.id, target } },
            {
              name: "mutatePage",
              args: { tabId: tab.id, operation: "click", target },
            },
            js("window.saved"),
          ]);
          assert.equal(out[0].pages[0].target.tag, "button");
          assert.equal(out[2].value, 1);
        },
      );

      await t.test(
        "mutatePage clicks links in place and edits text",
        async () => {
          const edit = (selector, operation, value) => ({
            name: "mutatePage",
            args: { tabId: tab.id, operation, target: { selector }, value },
          });
          const out = await run([
            edit("#input", "input", "typed"),
            edit("#note", "setText", "new note"),
            js(
              "[document.querySelector('#input').value,document.querySelector('#note').innerText]",
            ),
            {
              name: "mutatePage",
              args: {
                tabId: tab.id,
                operation: "click",
                target: { selector: "#spa" },
              },
            },
            js("window.spa"),
          ]);
          assert.deepEqual(out[2].value, ["typed", "new note"]);
          assert.equal(out[3].openedTabId, undefined);
          assert.equal(out[4].value, 1);
        },
      );

      await t.test("mutatePage setHtml cannot run page script", async () => {
        const out = await run([
          {
            name: "mutatePage",
            args: {
              tabId: tab.id,
              operation: "setHtml",
              target: { selector: "#target" },
              value: '<img src="x" onerror="window.xss=1"><b>ok</b>',
            },
          },
          { name: "wait", args: { milliseconds: 300 } },
          js(
            "({xss:window.xss ?? null,bold:!!document.querySelector('#target b')})",
          ),
        ]);
        assert.deepEqual(out[2].value, { xss: null, bold: true });
      });
      assert.equal(await attached(), false);
    } finally {
      await fixture.close();
    }
  },
);
