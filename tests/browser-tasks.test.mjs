import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { TOOL_NAME } from "../src/shared/tool-names.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  createWatchInUi,
  notifications,
  offeredTools,
  openTaskList,
  openSidePanel,
  ranAfter,
  runNow,
  runStarts,
  storageValue,
  t,
  taskRowText,
  taskStates,
  thisDevice,
  startTaskExtension,
  watchModel,
} from "./browser-tasks-helpers.mjs";

const pricePage = (price) =>
  `<!doctype html><title>Bracket</title><main><h1>Steel bracket</h1><p>Price: ${price}</p><p>In stock</p></main>`;

test(
  "a watch runs the model only when its page changed, notifies, and stores the run as a chat",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    let price = 42;
    const session = await startTaskExtension({
      pages: () => ({ "/item": pricePage(price) }),
      model: watchModel(39),
    });
    const { browser, extensionUrl, fixture, options } = session;
    try {
      const panel = await openSidePanel(browser, extensionUrl);
      await createWatchInUi(panel, {
        title: "Bracket price",
        prompt: "Tell me when the price drops below 40",
        url: session.url("/item"),
        minutes: 1,
      });
      const [task] = await storageValue(options, STORAGE_KEYS.tasks);
      assert.equal(task.trigger.kind, "watch");
      assert.equal(task.trigger.everyMinutes, 1);
      assert.equal(task.deviceId, await thisDevice(options));

      // The first look takes the baseline (one model run, condition not met).
      const first = await ranAfter(options, task.id);
      assert.equal(first.lastResult.status, "notMet");
      assert.equal(runStarts(fixture.requests).length, 1);
      assert.ok(first.baseline?.hash);

      // Unchanged page: the check reads it, no model run.
      await runNow(options, task.id);
      const second = await ranAfter(options, task.id, first.lastRunAt);
      assert.equal(second.baseline.hash, first.baseline.hash);
      assert.equal(runStarts(fixture.requests).length, 1);
      assert.deepEqual(await notifications(options), {});

      // The page changes: exactly one model run, which finds the condition.
      price = 39;
      await runNow(options, task.id);
      const third = await ranAfter(options, task.id, second.lastRunAt);
      assert.equal(third.lastResult.status, "met");
      assert.equal(runStarts(fixture.requests).length, 2);
      assert.notEqual(third.baseline.hash, first.baseline.hash);
      const shown = await poll(async () => {
        const all = Object.keys(await notifications(options));
        return all.length && all;
      });
      assert.equal(shown.length, 1);
      assert.match(
        shown[0],
        new RegExp(`${task.id}:${third.lastResult.chatId}`),
      );
      // The run is an ordinary chat, linked to its task.
      const chats = await storageValue(options, STORAGE_KEYS.chats);
      const chat = chats.find((item) => item.id === third.lastResult.chatId);
      assert.equal(chat?.taskId, task.id);
      // The page text reached the model as untrusted data.
      const judged = runStarts(fixture.requests)[1].body.messages.at(-1);
      assert.match(JSON.stringify(judged.content), /untrusted/);

      // The list shows the result; unchanged again: still no model run.
      await poll(async () =>
        (await taskRowText(panel, task.id)).includes(t.tasks.results.met),
      );
      await runNow(options, task.id);
      await ranAfter(options, task.id, third.lastRunAt);
      assert.equal(runStarts(fixture.requests).length, 2);
      // The toolbar badge counts the result until the list is seen again.
      const badge = () => options.call(() => chrome.action.getBadgeText({}));
      assert.equal(await badge(), "1");
      await clickElement(panel, `[aria-label="${t.sidepanel.backToChat}"]`);
      await openTaskList(panel);
      await poll(async () => (await badge()) === "");
    } finally {
      await session.close();
    }
  },
);

// A custom agent with every tool group; whether it may act on its own is
// the test's.
const agent = (actUnattended) => ({
  id: actUnattended ? "doer" : "looker",
  name: actUnattended ? "Doer" : "Looker",
  prompt: "",
  toolGroups: ["pages", "browser", "web"],
  workspace: false,
  actUnattended,
  createdAt: 1,
  updatedAt: 1,
});

const BUTTON_PAGE = `<!doctype html><title>Order</title><main>
<button onclick="fetch('/clicked')">Reorder</button></main>`;

test(
  "a read-only task run is not offered act; an agent that may act clicks",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    let clicks = 0;
    const model = (body) => {
      const tools = body.messages.filter((m) => m.role === "tool");
      const offered = (body.tools || []).map((tool) => tool.function.name);
      if (!offered.includes(TOOL_NAME.act))
        // The fixture model tries to act anyway.
        return tools.length
          ? { text: "I could not act." }
          : { calls: [{ id: "a1", name: TOOL_NAME.act, args: { steps: [] } }] };
      const steps = [
        {
          name: TOOL_NAME.tabs,
          args: { action: "open", url: `${baseUrl}/order` },
        },
        { name: TOOL_NAME.snapshot, args: {} },
        () => {
          const text = tools[1].content;
          const line = text
            .split("\n")
            .find((item) => item.includes("Reorder"));
          const ref = line
            .slice(line.indexOf("Reorder"))
            .match(/\b(e\d+)\b/)[1];
          return {
            name: TOOL_NAME.act,
            args: { steps: [{ action: "click", ref }] },
          };
        },
      ];
      const step = steps[tools.length];
      if (!step) return { text: "Reordered." };
      return {
        calls: [
          {
            id: `s${tools.length}`,
            ...(typeof step === "function" ? step() : step),
          },
        ],
      };
    };
    let baseUrl = "";
    const session = await startTaskExtension({
      pages: { "/order": BUTTON_PAGE },
      model,
      extraStorage: () => ({ agents: [agent(false), agent(true)] }),
    });
    const { fixture, options } = session;
    baseUrl = fixture.baseUrl;
    const original = fixture.requests;
    try {
      const deviceId = await thisDevice(options);
      const task = (id, agentId) => ({
        id,
        title: id,
        prompt: "Reorder the bracket",
        agentId,
        trigger: { kind: "daily", time: "09:00" },
        deviceId,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await options.call((items) => chrome.storage.local.set(items), {
        [STORAGE_KEYS.tasks]: [
          task("read-only", "looker"),
          task("acting", "doer"),
        ],
      });
      await runNow(options, "read-only");
      const readOnly = await ranAfter(options, "read-only");
      const lookerRuns = runStarts(original);
      assert.equal(lookerRuns.length, 1);
      assert.ok(!offeredTools(lookerRuns[0]).includes(TOOL_NAME.act));
      assert.ok(offeredTools(lookerRuns[0]).includes(TOOL_NAME.read));
      // The refused call never reached a page.
      assert.equal(
        original.filter((request) => request.url === "/clicked").length,
        0,
      );
      assert.ok(readOnly.lastResult);

      await runNow(options, "acting");
      await ranAfter(options, "acting");
      const doerRun = runStarts(original).at(-1);
      assert.ok(offeredTools(doerRun).includes(TOOL_NAME.act));
      clicks = await poll(
        () => original.filter((request) => request.url === "/clicked").length,
      );
      assert.equal(clicks, 1);
    } finally {
      await session.close();
    }
  },
);

test(
  "the task list pauses, resumes, runs now and deletes",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    // The outcome, then a final answer.
    const session = await startTaskExtension({
      model: (body) =>
        body.messages.some((m) => m.role === "tool")
          ? { text: "Here is the summary." }
          : {
              calls: [
                {
                  id: "r",
                  name: TOOL_NAME.taskResult,
                  args: {
                    outcome: "report",
                    summary: "Morning summary ready.",
                  },
                },
              ],
            },
    });
    const { browser, extensionUrl, fixture, options } = session;
    try {
      const deviceId = await thisDevice(options);
      await options.call((items) => chrome.storage.local.set(items), {
        [STORAGE_KEYS.tasks]: [
          {
            id: "daily",
            title: "Morning news",
            prompt: "Summarize the news",
            agentId: "general-agent",
            trigger: { kind: "daily", time: "09:00" },
            deviceId,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });
      const panel = await openSidePanel(browser, extensionUrl);
      await clickElement(panel, ".tasks-button");
      const row = '[data-task-id="daily"]';
      await poll(() => panel.call((row) => !!document.querySelector(row), row));
      assert.match(await taskRowText(panel, "daily"), /Morning news/);

      await clickElement(
        panel,
        `${row} [aria-label="${t.tasks.actions.pause}"]`,
      );
      await poll(
        async () =>
          (await storageValue(options, STORAGE_KEYS.tasks))[0].enabled ===
          false,
      );
      await poll(async () =>
        (await taskRowText(panel, "daily")).includes(t.tasks.status.paused),
      );
      await clickElement(
        panel,
        `${row} [aria-label="${t.tasks.actions.resume}"]`,
      );
      await poll(
        async () =>
          (await storageValue(options, STORAGE_KEYS.tasks))[0].enabled === true,
      );

      await clickElement(
        panel,
        `${row} [aria-label="${t.tasks.actions.runNow}"]`,
      );
      const ran = await ranAfter(options, "daily");
      assert.equal(ran.lastResult.status, "reported");
      assert.equal(runStarts(fixture.requests).length, 1);
      await poll(async () =>
        (await taskRowText(panel, "daily")).includes("Morning summary ready."),
      );
      assert.ok(Object.keys(await notifications(options)).length >= 1);

      // Opening the result shows the run's chat.
      await clickElement(panel, `${row} .history-select`);
      await poll(() =>
        panel.call(() =>
          (document.querySelector(".messages")?.textContent || "").includes(
            "Summarize the news",
          ),
        ),
      );

      await clickElement(panel, ".tasks-button");
      await clickElement(
        panel,
        `${row} [aria-label="${t.tasks.actions.delete}"]`,
      );
      await clickElement(panel, '[role="alertdialog"] button', {
        text: t.common.delete,
        exact: true,
      });
      await poll(
        async () =>
          (await storageValue(options, STORAGE_KEYS.tasks)).length === 0,
      );
      await poll(() => panel.call((row) => !document.querySelector(row), row));
      assert.equal((await taskStates(options)).daily, undefined);
    } finally {
      await session.close();
    }
  },
);

test(
  "a run that asks a question pauses the task as needing the user",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startTaskExtension({
      model: (body) =>
        body.messages.some((m) => m.role === "tool")
          ? { text: "I need to know which store to check." }
          : {
              calls: [
                {
                  id: "q",
                  name: TOOL_NAME.ask,
                  args: {
                    questions: [
                      { question: "Which store?", options: [{ label: "A" }] },
                    ],
                  },
                },
              ],
            },
    });
    const { options } = session;
    try {
      const deviceId = await thisDevice(options);
      await options.call((items) => chrome.storage.local.set(items), {
        [STORAGE_KEYS.tasks]: [
          {
            id: "asks",
            title: "Stock check",
            prompt: "Check the stock",
            agentId: "general-agent",
            trigger: { kind: "interval", every: 1, unit: "hours" },
            deviceId,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });
      await runNow(options, "asks");
      const state = await ranAfter(options, "asks");
      assert.equal(state.lastResult.status, "needsUser");
      assert.equal(state.pausedBy, "needsUser");
      assert.equal(state.nextRunAt, undefined);
      const ids = await poll(async () => {
        const all = Object.keys(await notifications(options));
        return all.length && all;
      });
      assert.match(ids[0], /asks:/);
    } finally {
      await session.close();
    }
  },
);

test(
  "the agent creates a task when asked in words, with its own agent, never acting by itself",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    let baseUrl = "";
    const session = await startTaskExtension({
      pages: { "/item": pricePage(42) },
      model: (body) => {
        const tools = body.messages.filter((m) => m.role === "tool").length;
        if (tools === 0)
          return {
            calls: [
              {
                id: "load",
                name: TOOL_NAME.toolSearch,
                args: { names: [TOOL_NAME.scheduleTask] },
              },
            ],
          };
        if (tools === 1)
          return {
            calls: [
              {
                id: "make",
                name: TOOL_NAME.scheduleTask,
                args: {
                  title: "Price watch",
                  prompt: "Tell me when the price drops below 40",
                  kind: "watch",
                  url: `${baseUrl}/item`,
                  everyMinutes: 0,
                },
              },
            ],
          };
        return { text: "I will watch the page every minute." };
      },
    });
    const { browser, extensionUrl, options } = session;
    baseUrl = session.fixture.baseUrl;
    try {
      const panel = await openSidePanel(browser, extensionUrl);
      await panel.call(() => {
        const box = document.querySelector(".composer-box textarea");
        box.focus();
      });
      await panel.send("Input.insertText", {
        text: "Check this page every minute and tell me when the price drops",
      });
      await clickElement(panel, ".send-button");
      const [task] = await poll(async () => {
        const tasks = await storageValue(options, STORAGE_KEYS.tasks);
        return tasks?.length && tasks;
      });
      assert.equal(task.trigger.kind, "watch");
      // The least interval holds whatever the model asked for.
      assert.equal(task.trigger.everyMinutes, 1);
      assert.equal(task.agentId, "general-agent");
      // The step tells the user that runs only look.
      await poll(() =>
        panel.call(
          (text) =>
            (document.querySelector(".messages")?.textContent || "").includes(
              text,
            ),
          t.tasks.form.looksOnly,
        ),
      );
      const agents = (await storageValue(options, STORAGE_KEYS.agents)) || [];
      assert.ok(agents.every((agent) => agent.actUnattended !== true));
    } finally {
      await session.close();
    }
  },
);
