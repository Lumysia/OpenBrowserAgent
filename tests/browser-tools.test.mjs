import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture } from "./browser-tool-fixture.mjs";
import { poll } from "./chromium.mjs";

// Real Chromium is the only place where layout, hit-testing, form defaults
// and inline handlers behave as they do for users.
const PAGE = `<title>OBA tool fixture</title>
<h1>Fixture heading</h1>
<p id="intro">Read the <a href="/docs">documentation</a> before you start.<sup><a href="#note-1">[1]</a></sup></p>
<form onsubmit="event.preventDefault();window.submitted=(window.submitted||0)+1">
  <label>Name <input id="name" value="old"></label>
  <label>Country <select id="country"><option>Chile</option><option>Norway</option><option>Sweden</option></select></label>
</form>
<button id="once" onclick="document.body.dataset.once=(+document.body.dataset.once||0)+1;this.remove()">Click once</button>
<button id="count" onclick="window.counter=(window.counter||0)+1">Count</button>
<div id="note" style="margin-top:3000px">Far below: the secret word is pelican.</div>`;

const BIG = `<title>Big</title><ul>${Array.from(
  { length: 3000 },
  (_, index) => `<li>Row ${index} with some filler text to make it long</li>`,
).join("")}</ul>`;

// The ref written right after `label` in a snapshot line.
const ref = (text, label) => {
  const line = text.split("\n").find((item) => item.includes(label));
  assert.ok(line, `no line with ${label} in:\n${text}`);
  return line.slice(line.indexOf(label)).match(/\b(e\d+)\b/)?.[1];
};

test(
  "page tools: refs, batches, caps, edits and the tool set",
  { timeout: 240000 },
  async (t) => {
    const fixture = await browserToolFixture((request, response) => {
      const pages = {
        "/page": PAGE,
        "/big": BIG,
        "/other": "<title>Other</title><p>Other page</p>",
      };
      if (!pages[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(pages[request.url]);
      return true;
    });
    const { page } = fixture;
    const open = async (path) => {
      const tab = await page.call(
        (url) => chrome.tabs.create({ url, active: true }),
        `${fixture.baseUrl}${path}`,
      );
      await poll(() =>
        page.call(
          async (id) => (await chrome.tabs.get(id)).status === "complete",
          tab.id,
        ),
      );
      return tab.id;
    };
    const evaluate = (tabId, code) =>
      page.call(
        async ({ tabId, code }) =>
          (
            await chrome.scripting.executeScript({
              target: { tabId },
              world: "MAIN",
              func: (source) => (0, eval)(source),
              args: [code],
            })
          )[0].result,
        { tabId, code },
      );
    try {
      const tabId = await open("/page");

      await t.test(
        "only the core tools are declared; removed tools are gone",
        async () => {
          await fixture.run([]);
          const names = fixture.requests[0].tools
            .map((tool) => tool.function.name)
            .sort();
          assert.deepEqual(names, [
            "act",
            "ask",
            "editPage",
            "extract",
            "find",
            "read",
            "screenshot",
            "snapshot",
            "tabs",
            "toolSearch",
            "webSearch",
          ]);
          const schemas = JSON.stringify(fixture.requests[0].tools);
          for (const removed of [
            "inspectPage",
            "mutatePage",
            "cdpInput",
            "getCurrentTime",
            "getCurrentTab",
            "captureVisibleTab",
            "readFileFromUrl",
            "readUploadedAttachment",
            "manageMemory",
            "loadTools",
            '"reason"',
          ])
            assert.ok(!schemas.includes(removed), removed);
        },
      );

      await t.test(
        "refs stay stable and a stale ref fails clearly",
        async () => {
          const [first, second] = await fixture.run([
            { name: "snapshot", args: { tabId } },
            { name: "snapshot", args: { tabId, scope: "page" } },
          ]);
          assert.match(first, /heading \[e\d+\] h1: Fixture heading/);
          assert.match(first, /\[documentation\]\(e\d+\)/);
          assert.equal(ref(first, "Click once"), ref(second, "Click once"));
          const once = ref(first, "Click once");
          const [acted, stale] = await fixture.run([
            {
              name: "act",
              args: { tabId, steps: [{ action: "click", ref: once }] },
            },
            {
              name: "act",
              args: { tabId, steps: [{ action: "click", ref: once }] },
            },
          ]);
          assert.match(acted, /Done: 1\. click/);
          assert.match(acted, /Gone \(1\): button "Click once"/);
          assert.match(
            stale,
            /is stale: that element is no longer on the page\. Take a new snapshot/,
          );
          assert.equal(
            await evaluate(tabId, "document.body.dataset.once"),
            "1",
          );
        },
      );

      await t.test(
        "a batch types, selects and submits, and stops at the first failure",
        async () => {
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const name = ref(snapshot, 'textbox "Name"');
          const country = ref(snapshot, 'combobox "Country"');
          const count = ref(snapshot, 'button "Count"');
          const [done, failed] = await fixture.run([
            {
              name: "act",
              args: {
                tabId,
                steps: [
                  { action: "type", ref: name, text: "Mara" },
                  { action: "select", ref: country, value: "sweden" },
                  { action: "press", ref: name, key: "Enter" },
                ],
              },
            },
            {
              name: "act",
              args: {
                tabId,
                steps: [
                  { action: "click", ref: count },
                  { action: "click", ref: "e999999" },
                  { action: "click", ref: count },
                ],
              },
            },
          ]);
          assert.match(done, /selected "Sweden"/);
          assert.deepEqual(
            await evaluate(
              tabId,
              "[document.querySelector('#name').value, document.querySelector('#country').value, window.submitted]",
            ),
            ["Mara", "Sweden", 1],
          );
          assert.match(
            failed,
            /Step 2 \(click e999999\) failed: Ref e999999 is not on this page.*Later steps were not run/s,
          );
          assert.equal(await evaluate(tabId, "window.counter"), 1);
        },
      );

      await t.test(
        "find searches beyond the viewport and returns refs",
        async () => {
          const [found, missing] = await fixture.run([
            { name: "find", args: { tabId, query: "pelican" } },
            { name: "find", args: { tabId, query: "/flamingo|ostrich/" } },
          ]);
          assert.match(
            found,
            /1 matches for "pelican":\n- text \[e\d+\]: Far below: the secret word is pelican\./,
          );
          assert.match(missing, /No match/);
        },
      );

      await t.test(
        "editPage keeps marked links and inserts without script",
        async () => {
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const intro = ref(snapshot, "paragraph");
          const link = snapshot.match(/\[documentation\]\((e\d+)\)/)[1];
          const note = snapshot.match(/\[\[1\]\]\((e\d+)\)/)[1];
          const [edited] = await fixture.run([
            {
              name: "editPage",
              args: {
                tabId,
                edits: [
                  {
                    op: "setText",
                    ref: intro,
                    text: `Lisez la [documentation](${link}) avant de commencer.[[1]](${note})`,
                  },
                  {
                    op: "insert",
                    ref: intro,
                    position: "after",
                    html: '<img src="x" onerror="window.xss=1"><b>ajouté</b>',
                  },
                ],
              },
            },
          ]);
          assert.match(edited, /Applied 2 of 2 edits/);
          assert.match(edited, /Inserted: e\d+/);
          await new Promise((resolve) => setTimeout(resolve, 300));
          assert.deepEqual(
            await evaluate(
              tabId,
              "[document.querySelector('#intro').textContent, document.querySelector('#intro a').getAttribute('href'), document.querySelectorAll('#intro a').length, window.xss ?? null, !!document.querySelector('[data-oba-inserted] b, b[data-oba-inserted]')]",
            ),
            [
              "Lisez la documentation avant de commencer.[1]",
              "/docs",
              2,
              null,
              true,
            ],
          );
        },
      );

      await t.test(
        "refs from a previous page fail after navigation",
        async () => {
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const count = ref(snapshot, 'button "Count"');
          const [navigated, old] = await fixture.run([
            {
              name: "tabs",
              args: {
                action: "navigate",
                tabId,
                url: `${fixture.baseUrl}/other`,
              },
            },
            {
              name: "act",
              args: { tabId, steps: [{ action: "click", ref: count }] },
            },
          ]);
          assert.match(navigated, /Other/);
          assert.match(
            old,
            /is not on this page: the page navigated or reloaded/,
          );
        },
      );

      await t.test(
        "a long page shows the viewport, caps the result and keeps the full text readable",
        async () => {
          const big = await open("/big");
          const [pageScope] = await fixture.run([
            { name: "snapshot", args: { tabId: big, scope: "page" } },
          ]);
          const list = pageScope.match(
            /… 2950 more items \(snapshot ref=(e\d+) shows all\)/,
          )?.[1];
          assert.ok(list, pageScope.slice(0, 300));
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId: big, ref: list } },
          ]);
          assert.match(
            snapshot,
            /\[Output truncated: showed \d+ of \d+ characters\. The full output is stored as "art-[0-9a-f]+"/,
          );
          assert.ok(!/Row 2999/.test(snapshot));
          // Handles belong to their chat, so the read runs in the same chat.
          const [auto, read] = await fixture.run((body) => {
            const results = body.messages.filter(
              (message) => message.role === "tool",
            );
            if (!results.length)
              return {
                calls: [{ id: "auto", name: "snapshot", args: { tabId: big } }],
              };
            if (results.length === 1) {
              const handle = results[0].content.match(
                /is stored as "(art-[0-9a-f]+)"/,
              )?.[1];
              return {
                calls: [
                  {
                    id: "read",
                    name: "read",
                    args: { source: handle, offset: 150000 },
                  },
                ],
              };
            }
            return { text: "done" };
          });
          assert.match(auto, /\[Viewport y=0-/);
          assert.match(
            auto,
            /full page snapshot \(\d+ chars\) is stored as "art-/,
          );
          assert.match(read, /characters 150000-/);
          await page.call((id) => chrome.tabs.remove(id), big);
        },
      );

      await t.test(
        "on-demand tools are appended by toolSearch without schemas in the result",
        async () => {
          const [loaded] = await fixture.run([
            { name: "toolSearch", args: { names: ["runScript"] } },
          ]);
          assert.equal(loaded, "Loaded runScript. Call them directly now.");
          const before = fixture.requests[0].tools.map(
            (tool) => tool.function.name,
          );
          const after = fixture.requests[1].tools.map(
            (tool) => tool.function.name,
          );
          assert.deepEqual(after.slice(0, before.length), before);
          assert.deepEqual(after.slice(before.length), ["runScript"]);
        },
      );
    } finally {
      await fixture.close();
    }
  },
);

test(
  "a sub-agent runs in the background with no side panel open",
  { timeout: 120000 },
  async () => {
    const fixture = await browserToolFixture();
    try {
      await fixture.run((body) => {
        const user = JSON.stringify(
          body.messages.find((message) => message.role === "user"),
        );
        const results = body.messages.filter(
          (message) => message.role === "tool",
        );
        if (user.includes("Count the moons"))
          return { text: "Mars has 2 moons." };
        if (!results.length)
          return {
            calls: [
              { id: "load", name: "toolSearch", args: { names: ["subAgent"] } },
            ],
          };
        if (results.length === 1)
          return {
            calls: [
              {
                id: "child",
                name: "subAgent",
                args: { task: "Count the moons of Mars." },
              },
            ],
          };
        return { text: "Parent done." };
      });
      const [, result] = fixture.toolTexts();
      assert.match(
        result,
        /Sub-agent "Count the moons of Mars\." \(Fixture\) finished\.\nMars has 2 moons\./,
      );
      const child = await fixture.page.call(async () => {
        const { chats } = await chrome.storage.local.get("chats");
        return chats.find((chat) => chat.kind === "subagent");
      });
      assert.equal(child.title, "Count the moons of Mars.");
      assert.equal(child.messageCount, 2);
      assert.equal(child.running, undefined);
    } finally {
      await fixture.close();
    }
  },
);
