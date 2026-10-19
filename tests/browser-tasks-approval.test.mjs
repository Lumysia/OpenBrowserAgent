import assert from "node:assert/strict";
import { test } from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { TOOL_NAME } from "../src/shared/tool-names.ts";
import { BROWSER_TEST_TIMEOUT } from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import {
  chatText,
  isTaskRun,
  notifications,
  openSidePanel,
  openTaskList,
  pricePage,
  ranAfter,
  runStarts,
  scriptedModel,
  seedTasks,
  send,
  startTaskExtension,
  storageValue,
  t,
  taskRowText,
  taskStates,
  thisDevice,
  watchModel,
} from "./browser-tasks-helpers.mjs";

// The user's OK on this device: for what the agent's task tool creates or
// changes (on its step card and in the list), and for a task that came by
// sync.

test(
  "a task the agent creates waits for the user's OK on its step and runs once confirmed",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    let baseUrl = "";
    const session = await startTaskExtension({
      pages: { "/item": pricePage(42) },
      model: scriptedModel(
        [
          { name: TOOL_NAME.toolSearch, args: { names: [TOOL_NAME.tasks] } },
          () => ({
            name: TOOL_NAME.tasks,
            args: {
              action: "create",
              title: "Price watch",
              prompt: "Tell me when the price drops below 40",
              kind: "watch",
              url: `${baseUrl}/item`,
              everyMinutes: 0,
            },
          }),
        ],
        "I set up the watch; it waits for your OK.",
      ),
    });
    const { browser, extensionUrl, fixture, options } = session;
    baseUrl = fixture.baseUrl;
    try {
      const panel = await openSidePanel(browser, extensionUrl);
      await send(panel, "Check this page every minute for a price drop");
      const [task] = await poll(async () => {
        const tasks = await storageValue(options, STORAGE_KEYS.tasks);
        return tasks?.length && tasks;
      });
      assert.equal(task.trigger.kind, "watch");
      assert.equal(task.trigger.everyMinutes, 1);
      assert.equal(task.agentId, "general-agent");
      // The step says what was made, that runs only look and that it waits.
      await poll(async () => {
        const text = await chatText(panel);
        return (
          text.includes(t.tasks.approval.onlyLooks) &&
          text.includes(t.tasks.status.needsOk) &&
          text.includes("Price watch")
        );
      });
      // The result told the model so.
      const toolResult = fixture.requests
        .flatMap((request) => request.body.messages || [])
        .find((m) => m.role === "tool" && String(m.content).includes(task.id));
      assert.match(String(toolResult.content), /waits for the user's OK/);
      // A new watch looks at once, but this one waits: no task run, badge 1.
      const badge = () => options.call(() => chrome.action.getBadgeText({}));
      await poll(async () => (await badge()) === "1");
      const taskRuns = () =>
        runStarts(fixture.requests).filter((request) => isTaskRun(request.body))
          .length;
      assert.equal(taskRuns(), 0);
      assert.equal((await taskStates(options))[task.id]?.lastRunAt, undefined);
      // Confirm on the step card: it runs.
      await clickElement(panel, ".tool-card .task-approval-actions button", {
        text: t.tasks.approval.allow,
        exact: true,
      });
      await ranAfter(options, task.id);
      assert.equal(taskRuns(), 1);
      await poll(() =>
        panel.call(
          () => !document.querySelector(".tool-card .task-approval-actions"),
        ),
      );
      const agents = (await storageValue(options, STORAGE_KEYS.agents)) || [];
      assert.ok(agents.every((agent) => agent.actUnattended !== true));
    } finally {
      await session.close();
    }
  },
);

test(
  "the agent lists, changes and deletes tasks; the change waits for the OK",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startTaskExtension({
      model: scriptedModel(
        [
          { name: TOOL_NAME.toolSearch, args: { names: [TOOL_NAME.tasks] } },
          { name: TOOL_NAME.tasks, args: { action: "list" } },
          {
            name: TOOL_NAME.tasks,
            args: {
              action: "update",
              id: "news",
              title: "Evening news",
              time: "18:00",
            },
          },
          { name: TOOL_NAME.tasks, args: { action: "delete", id: "old" } },
        ],
        "Done.",
      ),
    });
    const { browser, extensionUrl, fixture, options } = session;
    try {
      const deviceId = await thisDevice(options);
      const daily = (id, title) => ({
        id,
        title,
        prompt: "Summarize the news",
        agentId: "general-agent",
        trigger: { kind: "daily", time: "09:00" },
        deviceId,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await seedTasks(options, [
        daily("news", "Morning news"),
        daily("old", "Old digest"),
      ]);
      const panel = await openSidePanel(browser, extensionUrl);
      await send(
        panel,
        "Move my news task to the evening and drop the old one",
      );
      const tasks = await poll(async () => {
        const all = await storageValue(options, STORAGE_KEYS.tasks);
        return all?.length === 1 && all;
      });
      assert.equal(tasks[0].title, "Evening news");
      assert.deepEqual(tasks[0].trigger, { kind: "daily", time: "18:00" });
      assert.equal((await taskStates(options)).old, undefined);
      // What the model read: both tasks listed with their ids.
      const results = fixture.requests
        .flatMap((request) => request.body.messages || [])
        .filter((m) => m.role === "tool")
        .map((m) => String(m.content));
      const listed = results.find((text) => text.includes('"count":2'));
      assert.match(listed, /"id":"news"/);
      assert.match(listed, /"id":"old"/);
      assert.ok(results.some((text) => /"waitingForOk":true/.test(text)));
      // The steps say what was done, in the UI language.
      const steps = t.display.toolSteps.actions;
      await poll(async () => {
        const text = await chatText(panel);
        return [steps.list, steps.update, steps.delete, "Evening news"].every(
          (part) => text.includes(part),
        );
      });
      // The changed task waits in the list, with Allow; Allow clears it.
      await openTaskList(panel);
      await poll(async () =>
        (await taskRowText(panel, "news")).includes(t.tasks.status.needsOk),
      );
      await clickElement(
        panel,
        '[data-task-id="news"] .task-approval-actions button',
        { text: t.tasks.approval.allow, exact: true },
      );
      await poll(
        async () =>
          !(await taskRowText(panel, "news")).includes(t.tasks.status.needsOk),
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "a task that came by sync runs only after Allow on this device",
  { timeout: BROWSER_TEST_TIMEOUT },
  async () => {
    const session = await startTaskExtension({
      pages: { "/item": pricePage(42) },
      model: watchModel(39),
    });
    const { browser, extensionUrl, fixture, options } = session;
    try {
      const deviceId = await thisDevice(options);
      // As sync stores it: the definition only, nothing allowed here.
      const task = {
        id: "synced",
        title: "Synced watch",
        prompt: "Tell me when the price drops below 40",
        agentId: "general-agent",
        trigger: {
          kind: "watch",
          url: `${fixture.baseUrl}/item`,
          everyMinutes: 1,
        },
        deviceId,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await seedTasks(options, [task], { allowed: false });
      // Notified once, counted on the badge, not run.
      const shown = await poll(async () => {
        const all = Object.keys(await notifications(options));
        return all.length && all;
      });
      assert.equal(shown.length, 1);
      assert.match(shown[0], /synced:/);
      const badge = () => options.call(() => chrome.action.getBadgeText({}));
      await poll(async () => (await badge()) === "1");
      assert.equal(runStarts(fixture.requests).length, 0);
      const panel = await openSidePanel(browser, extensionUrl);
      await openTaskList(panel);
      await poll(async () =>
        (await taskRowText(panel, "synced")).includes(t.tasks.status.needsOk),
      );
      // Run now is off until it is allowed.
      assert.equal(
        await panel.call(
          (label) =>
            document.querySelector(
              `[data-task-id="synced"] [aria-label="${label}"]`,
            ).disabled,
          t.tasks.actions.runNow,
        ),
        true,
      );
      await clickElement(
        panel,
        '[data-task-id="synced"] .task-approval-actions button',
        { text: t.tasks.approval.allow, exact: true },
      );
      // Allowed: the new watch takes its first look at once.
      await ranAfter(options, "synced");
      assert.equal(runStarts(fixture.requests).length, 1);
      await poll(async () => (await badge()) === "");
      assert.ok((await taskStates(options)).synced.approved);
    } finally {
      await session.close();
    }
  },
);
