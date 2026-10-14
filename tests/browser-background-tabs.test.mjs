import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { poll } from "./chromium.mjs";
import { browserToolFixture, ref } from "./browser-tool-fixture.mjs";

// A run works on the tab it started on while the user switches tabs: the
// actions land there, the user's tabs are untouched and stay in front, and
// the agent never takes the user's tab or window.
const AGENT_PAGE = `<!doctype html><title>Agent page</title>
<button onclick="window.presses = (window.presses || 0) + 1">Press</button>
<input aria-label="Name">
<a href="/opened" target="_blank">Open more</a>`;

const USER_PAGE = (name) => `<!doctype html><title>${name}</title>
<p>${name}</p><input aria-label="Notes">
<script>
  window.events = [];
  for (const type of ["click", "keydown", "input", "scroll"])
    addEventListener(type, () => events.push(type), true);
</script>`;

const toolTextAt = (body, index) =>
  body.messages
    .filter((message) => message.role === "tool")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.text || "").join(""),
    )[index];

test(
  "a run stays on its tab while the user switches tabs",
  { timeout: 180000 },
  async () => {
    const pages = {
      "/agent": AGENT_PAGE,
      "/user": USER_PAGE("User page"),
      "/other": USER_PAGE("Other user page"),
      "/opened": "<title>Opened page</title><p>Opened</p>",
      "/later": "<title>Later page</title><p>Later</p>",
    };
    const fixture = await browserToolFixture((request, response) => {
      if (!pages[request.url]) return false;
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(pages[request.url]);
      return true;
    });
    const { page, baseUrl, requests } = fixture;
    try {
      const userTab = await fixture.open("/user");
      const otherTab = await fixture.open("/other");
      // The run starts while the agent page is the one in front.
      const agentTab = await fixture.open("/agent");
      await page.call(() => {
        globalThis.focusLog = { activated: [], windows: [] };
        chrome.tabs.onActivated.addListener(({ tabId }) =>
          focusLog.activated.push(tabId),
        );
        chrome.windows.onFocusChanged.addListener((id) =>
          focusLog.windows.push(id),
        );
      });
      let openedTab;
      await fixture.start((body, index) => {
        const at = (label) => ref(toolTextAt(body, 0), label);
        const calls = [
          { name: "snapshot", args: {} },
          () => ({
            name: "act",
            args: {
              steps: [
                { action: "wait", ms: 1500 },
                { action: "click", ref: at("Press") },
                { action: "click", ref: at("Press"), trusted: true },
                { action: "type", ref: at("Name"), text: "hello" },
                { action: "press", ref: at("Name"), key: "X", trusted: true },
                { action: "click", ref: at("Open more"), trusted: true },
              ],
            },
          }),
          { name: "toolSearch", args: { names: ["runScript"] } },
          {
            name: "runScript",
            args: {
              code: "new Promise((resolve) => setTimeout(() => resolve([document.title, window.presses, document.querySelector('input').value, document.hasFocus()].join('|')), 2000))",
            },
          },
          { name: "snapshot", args: {} },
          { name: "screenshot", args: {} },
          { name: "tabs", args: { action: "open", url: `${baseUrl}/later` } },
          { name: "find", args: { query: "Later" } },
        ];
        if (index === calls.length) {
          openedTab = Number(toolTextAt(body, 6).match(/tab (\d+)/)[1]);
          return {
            calls: [
              {
                id: "close",
                name: "tabs",
                args: { action: "close", tabId: openedTab },
              },
            ],
          };
        }
        if (index === calls.length + 1)
          return {
            calls: [{ id: "closed", name: "snapshot", args: {} }],
          };
        const call = calls[index];
        return call
          ? {
              calls: [
                {
                  id: `call-${index}`,
                  ...(typeof call === "function" ? call() : call),
                },
              ],
            }
          : { text: "Fixture complete." };
      });
      // The user switches tabs during the act batch, and again while the
      // script runs.
      await poll(() => requests.length >= 2);
      await delay(400);
      await page.call(
        (id) => chrome.tabs.update(id, { active: true }),
        userTab,
      );
      await poll(() => requests.length >= 4);
      await delay(400);
      await page.call(
        (id) => chrome.tabs.update(id, { active: true }),
        otherTab,
      );
      await poll(() => page.call(() => toolRun.done), 90000);
      const texts = fixture.toolTexts();
      const [, acted, , script, snapshot, shot, opened, found, , closed] =
        texts;

      assert.match(acted, new RegExp(`^Tab ${agentTab}: Agent page`));
      assert.doesNotMatch(acted, /failed/);
      assert.match(acted, /Opened new tab \d+ .*Pass its tabId/);
      assert.match(script, new RegExp(`runScript on Tab ${agentTab}: Agent`));
      assert.match(script, /\nAgent page\|2\|helloX\|(true|false)$/);
      assert.match(snapshot, new RegExp(`^Tab ${agentTab}: Agent page`));
      assert.match(shot, new RegExp(`^Screenshot of tab ${agentTab} `));
      assert.doesNotMatch(shot, /shown for a moment/);
      assert.match(opened, /^Opened tab \d+ \(opened by you\)/);
      assert.match(found, new RegExp(`^Tab ${openedTab}: Later page`));
      assert.match(
        closed,
        new RegExp(
          `The tab you were working on \\(tab ${openedTab}: Later page\\) was closed`,
        ),
      );
      const outputs = await fixture.outputs();
      assert.ok(
        String(
          outputs.find((item) => item.name === "screenshot").output.image,
        ).startsWith("data:image/jpeg;base64,"),
      );

      // The user's tabs saw no input and the last one they chose is in
      // front; the agent activated no tab and focused no window.
      for (const id of [userTab, otherTab])
        assert.deepEqual(await fixture.evaluate(id, "events"), []);
      const state = await page.call(async () => ({
        log: focusLog,
        active: (await chrome.tabs.query({ active: true })).map(
          (tab) => tab.id,
        ),
      }));
      assert.deepEqual(state.active, [otherTab]);
      assert.deepEqual(state.log.windows, []);
      // The browser shows the tab the agent's page opened, and the user's tab
      // is put back right away.
      const linked = Number(acted.match(/Opened new tab (\d+)/)[1]);
      assert.deepEqual(state.log.activated, [
        userTab,
        linked,
        userTab,
        otherTab,
      ]);
      assert.equal(
        (await page.call((id) => chrome.tabs.get(id), linked)).active,
        false,
      );
    } finally {
      await fixture.close();
    }
  },
);
