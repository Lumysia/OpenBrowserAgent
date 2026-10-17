import assert from "node:assert/strict";
import { test } from "node:test";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";

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

// Editable content: a plain one, and an editor that keeps its own model of
// the text (it inserts typed text itself on beforeinput, renders after a
// microtask, and puts its model back over any other change to its DOM).
const EDITORS = `<title>Editors</title>
<div id="plain" contenteditable role="textbox" aria-label="Plain">old text</div>
<div id="model" contenteditable role="textbox" aria-label="Model">old text</div>
<script>
  window.modelText = "old text";
  const render = () => { model.textContent = window.modelText; };
  model.addEventListener("beforeinput", (event) => {
    if (event.inputType !== "insertText") return;
    event.preventDefault();
    const all = getSelection().toString() === model.textContent;
    window.modelText = all ? event.data : window.modelText + event.data;
    queueMicrotask(render);
  });
  model.addEventListener("input", () => queueMicrotask(render));
</script>`;

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

test(
  "page tools: refs, batches, caps, edits and the tool set",
  { timeout: BROWSER_TEST_TIMEOUT },
  async (t) => {
    const fixture = await browserToolFixture((request, response) => {
      const pages = {
        "/page": PAGE,
        "/big": BIG,
        "/editors": EDITORS,
        "/other": "<title>Other</title><p>Other page</p>",
        "/shadow": SHADOW,
        "/huge": HUGE,
        "/table": `<title>Table</title><table><tr><th>Id</th><th>Status</th></tr>${Array.from(
          { length: 24 },
          (_, index) =>
            `<tr><td>${index}</td><td>${index % 4 ? "Paid" : "Refunded"}</td></tr>`,
        ).join("")}</table>`,
      };
      if (!pages[request.url]) return false;
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(pages[request.url]);
      return true;
    });
    const { page, open, evaluate } = fixture;
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
            /is stale: that element is no longer on the page, and no button "Click once" replaced it\. Take a new snapshot/,
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
        "typing into editable content reaches the editor's own model",
        async () => {
          const editors = await open("/editors");
          const [snapshot] = await fixture.run([
            { name: "snapshot", args: { tabId: editors } },
          ]);
          const [typed] = await fixture.run([
            {
              name: "act",
              args: {
                tabId: editors,
                steps: [
                  {
                    action: "type",
                    ref: ref(snapshot, 'textbox "Plain"'),
                    text: "new words",
                  },
                  {
                    action: "type",
                    ref: ref(snapshot, 'textbox "Model"'),
                    text: "new words",
                  },
                ],
              },
            },
          ]);
          assert.match(typed, /Done: 1\. type.*2\. type/s);
          assert.deepEqual(
            await evaluate(
              editors,
              "[plain.innerText, model.innerText, window.modelText]",
            ),
            ["new words", "new words", "new words"],
          );
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
            /1 matching line \(1 occurrence\) for "pelican":\n- text \[e\d+\]: Far below: the secret word is pelican\./,
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
          assert.match(
            found,
            /1 matching line \(2 occurrences\) for "Slotted"/,
          );
          const table = await open("/table");
          const [counted, searched] = await fixture.run([
            { name: "snapshot", args: { tabId: table } },
            {
              name: "read",
              args: { source: `tab:${table}`, search: "refunded" },
            },
          ]);
          assert.match(
            searched,
            /\| 6 matches for "refunded" in \d+ characters/,
          );
          assert.match(searched, /\n@\d+: .*«Refunded»/);
          assert.match(
            counted,
            /- counts of Status \(24 rows\): Paid 18, Refunded 6/,
          );
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
          await page.call(
            (ids) => chrome.tabs.remove(ids),
            [shadow, huge, table],
          );
        },
      );

      await t.test(
        "on-demand tools are appended by toolSearch without schemas in the result",
        async () => {
          const [loaded] = await fixture.run([
            { name: "toolSearch", args: { names: ["runScript"] } },
          ]);
          assert.equal(
            loaded,
            "Newly loaded: runScript. Call tools directly by these exact names.",
          );
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
  { timeout: BROWSER_TEST_TIMEOUT },
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
