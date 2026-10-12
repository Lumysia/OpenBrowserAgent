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

const SHADOW = `<title>Shadow</title><h1>Shadow</h1>
<my-card><span>Slotted words</span><button>Slotted button</button></my-card>
<script>customElements.define("my-card", class extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML = "<h2>Card title</h2><slot></slot>"; }
});</script>`;

const HUGE = `<title>Huge</title>${Array.from(
  { length: 9000 },
  (_, index) =>
    `<p>Paragraph ${index} with enough filler text to make the page very long indeed.</p>`,
).join("")}`;

const DIALOG = `<title>Dialog</title><button onclick="window.answer=confirm('Sure?')">Delete</button>`;
const ALERT = `<title>Alert</title><p>Alerting</p><script>setTimeout(() => alert("hi"), 200)</script>`;

const TRUSTED = `<title>Trusted</title>
<button id="real" style="position:fixed;left:10px;top:10px;width:120px;height:40px" onclick="if (event.isTrusted) window.realClicks = (window.realClicks || 0) + 1" ondblclick="window.double = (window.double || 0) + 1">Real only</button>
<input id="keys" style="position:fixed;left:10px;top:80px" onkeydown="if (event.isTrusted) window.typed = (window.typed || '') + event.key">`;

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
        "/shadow": SHADOW,
        "/huge": HUGE,
        "/dialog": DIALOG,
        "/alert": ALERT,
        "/trusted": TRUSTED,
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

      await t.test("only the core tools are declared", async () => {
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
      });

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
        "editPage keeps marked links and never runs or loads script",
        async () => {
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId } },
          ]);
          const intro = ref(snapshot, "paragraph");
          const link = snapshot.match(/\[documentation\]\((e\d+)\)/)[1];
          const note = snapshot.match(/\[\[1\]\]\((e\d+)\)/)[1];
          const edit = (edits) => ({
            name: "editPage",
            args: { tabId, edits },
          });
          const results = await fixture.run([
            edit([
              {
                op: "setText",
                ref: intro,
                text: `Lisez la [documentation](${link}) avant de commencer.[[1]](${note})`,
              },
              {
                op: "insert",
                ref: intro,
                position: "after",
                html: '<b>ajouté</b> <img src="data:image/png;base64,AA==" alt="">',
              },
            ]),
            edit([{ op: "insert", ref: intro, tag: "script", text: "" }]),
            edit([
              { op: "insert", ref: intro, tag: "script", html: "<b>x</b>" },
            ]),
            edit([
              {
                op: "insert",
                ref: intro,
                html: '<img src="x" onerror="window.xss=1">',
              },
            ]),
            edit([
              {
                op: "insert",
                ref: intro,
                html: '<svg><a><animate attributeName="href" values="javascript:window.xss=1"/></a></svg>',
              },
            ]),
            edit([
              {
                op: "setAttribute",
                ref: link,
                name: "href",
                value: " java\tscript:window.xss=1",
              },
            ]),
            edit([
              { op: "setAttribute", ref: link, name: "onclick", value: "1" },
            ]),
          ]);
          const [edited, ...refused] = results;
          assert.match(edited, /Applied 2 of 2 edits/);
          assert.match(edited, /Inserted: e\d+/);
          for (const text of refused)
            assert.match(
              text,
              /Applied 0 of 1 edits[\s\S]*(is not allowed|cannot hold a script URL)/,
            );
          await new Promise((resolve) => setTimeout(resolve, 300));
          assert.deepEqual(
            await evaluate(
              tabId,
              "[document.querySelector('#intro').textContent, document.querySelector('#intro a').getAttribute('href'), document.querySelectorAll('#intro a').length, window.xss ?? null, !!document.querySelector('[data-oba-inserted] b, b[data-oba-inserted]'), document.querySelectorAll('script, svg').length]",
            ),
            [
              "Lisez la documentation avant de commencer.[1]",
              "/docs",
              2,
              null,
              true,
              0,
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
        "slotted content shows, and a cut full snapshot says so",
        async () => {
          const shadow = await open("/shadow");
          const [snapshot, found] = await fixture.run([
            { name: "snapshot", args: { tabId: shadow } },
            { name: "find", args: { tabId: shadow, query: "Slotted" } },
          ]);
          assert.match(
            snapshot,
            /Slotted words \[button "Slotted button" e\d+\]/,
          );
          assert.match(found, /1 matches for "Slotted"/);
          const huge = await open("/huge");
          const [, end] = await fixture.run((body) => {
            const results = body.messages.filter(
              (message) => message.role === "tool",
            );
            if (!results.length)
              return {
                calls: [
                  { id: "full", name: "snapshot", args: { tabId: huge } },
                ],
              };
            if (results.length === 1) {
              const [, chars, handle] = results[0].content.match(
                /\((\d+) chars\) is stored as "(art-[0-9a-f]+)"/,
              );
              return {
                calls: [
                  {
                    id: "end",
                    name: "read",
                    args: { source: handle, offset: Number(chars) - 300 },
                  },
                ],
              };
            }
            return { text: "done" };
          });
          assert.match(
            end,
            /\[Snapshot cut at \d+ characters: the rest is missing/,
          );
          await page.call((ids) => chrome.tabs.remove(ids), [shadow, huge]);
        },
      );

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
