import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { TEACH_MESSAGE } from "../src/shared/teach/messages.ts";
import { TYPED_VALUE_MARKER } from "../src/shared/teach/redact.ts";
import { TEACH_STATE } from "../src/shared/teach/types.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { openSidePanel, startTaskExtension } from "./browser-tasks-helpers.mjs";
import { click, clickElement, typeText } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";

// What a recording lets out of the page, read where it leaves: every
// message the background gets from the recording page or the side panel,
// every storage.session value while recording, and the model request.
// Pages echo what the user typed (a suggestion, the title, a heading, the
// path; on the same page and on the next one), and fields turn secret in
// ways the first look misses (CSS masking, other languages, a shadow root's
// show-password toggle, a page that makes a field secret later).

const QUERY = "divorce lawyer near me";
const TERM = "Quarterly Tax Filing Help";
const KENNWORT = "Masked-Kennwort-1";
const SHADOW = "Shadow-Toggled-2";
const LATER = "Later-Secret-3";

const SEARCH = `<!doctype html><title>Find</title>
<main><h1>Find</h1>
<input name="q" aria-label="Search">
<div id="suggest"></div>
<section><h2 id="results-heading"></h2></section>
<form action="/results" method="get"><input name="q2" aria-label="Topic"><button>Go</button></form>
</main>
<script>
const q = document.querySelector('[name=q]');
q.addEventListener('input', () => {
  document.getElementById('suggest').innerHTML = '';
  const b = document.createElement('button');
  b.textContent = 'Search for ' + q.value;
  b.onclick = () => {
    document.title = q.value + ' - Results';
    document.getElementById('results-heading').textContent = 'Results for ' + q.value;
    history.pushState(null, '', '/find/' + encodeURIComponent(q.value).replace(/%20/g, '-'));
  };
  document.getElementById('suggest').append(b);
});
</script>`;

// The next document echoes the term it was sent in its title and heading.
const RESULTS = `<!doctype html><title>Results</title>
<main><h1 id="h"></h1><a id="hit" href="/secrets">First hit</a></main>
<script>
const term = new URLSearchParams(location.search).get('q2') || '';
document.title = term + ' - Search';
document.getElementById('h').textContent = 'Results for ' + term;
</script>`;

const SECRETS = `<!doctype html><title>Secrets</title>
<main><h1>Secrets</h1>
<input id="f1" aria-label="Kennwort" style="-webkit-text-security: disc">
<x-box id="box"></x-box>
<input id="f3" aria-label="Nickname">
<h2 id="elsewhere" tabindex="0">Elsewhere</h2>
</main>
<script>
const root = document.getElementById('box').attachShadow({ mode: 'open' });
root.innerHTML = '<input type="password" aria-label="Code"><button id="show">Show</button>';
root.getElementById('show').onclick = () => { root.querySelector('input').type = 'text'; };
document.getElementById('f3').addEventListener('change', (e) => { e.target.type = 'password'; });
</script>`;

const SKILL_MD = `---
name: "find-things"
description: "Finds things. Use when asked."
---

## Steps
1. Search.`;

function model(body) {
  const system = JSON.stringify(body.messages[0]?.content || "");
  if (system.includes("Skill from a recorded demonstration"))
    return { text: SKILL_MD };
  return { text: "Done." };
}

const teach = (panel, message) =>
  panel.call((message) => chrome.runtime.sendMessage(message), message);
const sessions = (panel) =>
  panel.call(
    async (key) => (await chrome.storage.session.get(key))[key] || {},
    STORAGE_KEYS.teachSessions,
  );
const current = async (panel) => Object.values(await sessions(panel))[0];

// Every echo form of the typed values, as the page wrote them.
const LEAKS = [
  QUERY,
  "divorce-lawyer-near-me",
  TERM,
  TERM.toLowerCase(),
  "Quarterly+Tax",
  KENNWORT,
  SHADOW,
  LATER,
];

function assertNoLeak(text, where) {
  for (const leak of LEAKS)
    assert.ok(
      !text.toLowerCase().includes(leak.toLowerCase()),
      `${where} holds ${leak}`,
    );
}

test(
  "a recording lets no typed value out of the page, echoed or secret",
  { timeout: BROWSER_TEST_TIMEOUT * 3 },
  async () => {
    const session = await startTaskExtension({
      pages: { "/search": SEARCH, "/results": RESULTS, "/secrets": SECRETS },
      model,
    });
    const { browser, fixture } = session;
    try {
      // Everything the background receives and keeps from now on.
      const worker = await session.worker();
      await worker.call((key) => {
        self.teachLog = [];
        chrome.runtime.onMessage.addListener((message) => {
          if (String(message?.type).startsWith("teach:"))
            self.teachLog.push(JSON.stringify(message));
        });
        chrome.storage.session.onChanged.addListener((changes) => {
          if (changes[key])
            self.teachLog.push(JSON.stringify(changes[key].newValue));
        });
      }, STORAGE_KEYS.teachSessions);

      const panel = await openSidePanel(browser, session.extensionUrl);
      const page = await browser.open(session.url("/search"));
      const tabId = await poll(() =>
        panel.call(
          async () =>
            (await chrome.tabs.query({})).find((tab) =>
              tab.url.endsWith("/search"),
            )?.id,
        ),
      );
      const started = await teach(panel, { type: TEACH_MESSAGE.start, tabId });
      assert.ok(started?.ok, JSON.stringify(started));
      await poll(async () => (await current(panel))?.typedKey);

      // 1. Echoes on the same page: a suggestion, the title, a heading and
      //    the path (pushState), before and after the field is committed.
      await typeText(page, QUERY, 'input[name="q"]');
      await poll(() =>
        page.call(() => !!document.querySelector("#suggest button")),
      );
      await clickElement(page, "#suggest button");
      await poll(() => page.call(() => location.pathname.startsWith("/find/")));
      await poll(async () =>
        (await current(panel)).steps.some((step) =>
          step.leadsTo?.includes(TYPED_VALUE_MARKER),
        ),
      );

      // 2. Echoes on the next document: it never saw the value.
      await typeText(page, TERM, 'input[name="q2"]');
      await clickElement(page, "form button");
      await poll(() =>
        page.call(() => location.pathname === "/results").catch(() => false),
      );
      await poll(() =>
        page.call(() => !!document.querySelector("[data-oba-ui]")),
      );
      await clickElement(page, "#hit");
      await poll(() =>
        page.call(() => location.pathname === "/secrets").catch(() => false),
      );
      await poll(async () =>
        (await current(panel)).steps.some(
          (step) => step.target?.name === "First hit",
        ),
      );

      // 3. Fields that are secret in ways a first look misses.
      await poll(() =>
        page.call(() => !!document.querySelector("[data-oba-ui]")),
      );
      await typeText(page, KENNWORT, "#f1");
      const show = await page.call(() => {
        const rect = document
          .getElementById("box")
          .shadowRoot.getElementById("show")
          .getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await click(page, show);
      await page.call(() =>
        document
          .getElementById("box")
          .shadowRoot.querySelector("input")
          .focus(),
      );
      await page.send("Input.insertText", { text: SHADOW });
      await typeText(page, LATER, "#f3");
      await page.call(() => document.getElementById("elsewhere").focus());
      await poll(async () => {
        const fields = (await current(panel)).steps.filter(
          (step) => step.kind === "field",
        );
        return fields.length >= 5;
      });

      // No example is kept of them: the tick asks the page again.
      const fields = (await current(panel)).steps.filter(
        (step) => step.kind === "field",
      );
      const secretOnes = fields.filter((step) =>
        ["Kennwort", "Code", "Nickname"].includes(step.target?.name),
      );
      assert.equal(secretOnes.length, 3, JSON.stringify(fields));
      for (const step of secretOnes) {
        const reply = await teach(panel, {
          type: TEACH_MESSAGE.keepExample,
          tabId,
          stepId: step.id,
          keep: true,
        });
        assert.equal(reply.value, false, step.target.name);
      }
      const after = (await current(panel)).steps.filter((step) =>
        secretOnes.some((item) => item.id === step.id),
      );
      assert.ok(
        after.every((step) => step.field.secret && !step.field.example),
        JSON.stringify(after),
      );

      // What the recording holds while recording has the markers instead.
      const recorded = JSON.stringify((await current(panel)).steps);
      assert.ok(recorded.includes(TYPED_VALUE_MARKER), recorded);
      assertNoLeak(recorded, "the recording");

      // Stop: the transcript goes to the model.
      await teach(panel, { type: TEACH_MESSAGE.stop, tabId });
      await poll(
        async () => (await current(panel))?.state === TEACH_STATE.review,
      );
      const requests = JSON.stringify(
        fixture.requests.map((request) => request.body),
      );
      assert.ok(requests.includes(TYPED_VALUE_MARKER));
      assertNoLeak(requests, "a model request");

      const log = await worker.call(() => self.teachLog);
      assert.ok(log.length > 10, `${log.length} messages and records`);
      for (const entry of log) assertNoLeak(entry, `background got ${entry}`);
    } finally {
      await session.close();
    }
  },
);
