import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createAgentDraft } from "../src/shared/agents";
import { storage } from "../src/shared/storage";
import { TOOL_NAME } from "../src/shared/tool-names";
import { observation } from "../src/shared/tasks/watch-text";
import { TASK_RESULT, type ScheduledTask } from "../src/shared/tasks/types";
import { adoptAgentTab } from "../src/background/agent-tabs";
import { judgeWatch, runTimeTask } from "../src/background/tasks/runner";
import { pageUnreachable } from "../src/background/tasks/watch-page";
import * as sessions from "../src/background/stream-sessions";
import { installPiRuntimeBrowser } from "./pi-runtime-helpers";
import { providerFixture, reply, type FixtureReply } from "./provider-fixtures";

// One run of a task against a fixture model: what the run's result is,
// and when the model is not asked at all.

installPiRuntimeBrowser();

const AGENT = { ...createAgentDraft("Watcher"), id: "watcher", toolGroups: [] };
const hooks = { onChat: () => {}, onTab: () => {} };

function task(trigger: ScheduledTask["trigger"]): ScheduledTask {
  return {
    id: "t1",
    title: "Prices",
    prompt: "Tell me when the price is below 50",
    agentId: AGENT.id,
    trigger,
    deviceId: "me",
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

const WATCH = task({
  kind: "watch",
  url: "https://shop.test/",
  everyMinutes: 5,
});
const HOURLY = task({ kind: "interval", every: 1, unit: "hours" });

// The model's replies, one per request; the last repeats.
async function withModel<T>(replies: FixtureReply[], body: () => Promise<T>) {
  const fixture = await providerFixture((request, response, requests) =>
    reply(
      response,
      request.protocol,
      replies[Math.min(requests.length, replies.length) - 1],
    ),
  );
  mock.method(storage.provider, "get", async () => ({
    fx: {
      type: "openai",
      apiKey: "",
      baseUrl: `${fixture.baseUrl}/v1`,
      models: [{ id: "fixture", name: "fixture" }],
    },
  }));
  mock.method(storage.agents, "get", async () => [AGENT]);
  try {
    const value = await body();
    return { value, requests: fixture.requests.length };
  } finally {
    await fixture.close();
  }
}

const report = (outcome: string, summary: string): FixtureReply => ({
  calls: [{ id: "r", name: TOOL_NAME.taskResult, args: { outcome, summary } }],
});

test("an unchanged page makes no model run", async () => {
  const baseline = await observation("Price: 60", 1);
  const { value, requests } = await withModel([{ text: "x" }], () =>
    judgeWatch(WATCH, baseline, "Price:   60\n\n", 42, hooks),
  );
  assert.equal(requests, 0);
  assert.equal(value.result.status, TASK_RESULT.unchanged);
  assert.deepEqual(value.baseline, baseline);
});

test("a changed page runs the model once and gives its verdict", async () => {
  const baseline = await observation("Price: 60", 1);
  const { value, requests } = await withModel(
    [report("met", "The price is 40."), { text: "It is 40 now." }],
    () => judgeWatch(WATCH, baseline, "Price: 40", 42, hooks),
  );
  sessions.abortSession(value.result.chatId!);
  assert.equal(requests, 2);
  assert.equal(value.result.status, TASK_RESULT.met);
  assert.equal(value.result.summary, "The price is 40.");
});

test("a time task that never reports its outcome is only answered", async () => {
  const { value } = await withModel([{ text: "Here is the news." }], () =>
    runTimeTask(HOURLY, hooks),
  );
  sessions.abortSession(value.result.chatId!);
  assert.equal(value.failed, false);
  assert.equal(value.result.status, TASK_RESULT.answered);
  assert.equal(value.result.summary, "Here is the news.");
});

test("a time task that reports has a verdict", async () => {
  const { value } = await withModel(
    [report("report", "Two new posts."), { text: "Two posts." }],
    () => runTimeTask(HOURLY, hooks),
  );
  sessions.abortSession(value.result.chatId!);
  assert.equal(value.result.status, TASK_RESULT.reported);
  assert.equal(value.result.summary, "Two new posts.");
});

test("tabs a task run opened close when it ends; the user's tabs stay", async () => {
  let opened: number | undefined;
  const { value } = await withModel(
    [report("nothing", "Nothing new."), { text: "Nothing." }],
    () =>
      runTimeTask(HOURLY, {
        ...hooks,
        // As `tabs open` does in the run: a tab of the run's chat.
        onChat: (chatId) =>
          void chrome.tabs
            .create({ url: "https://news.test/", active: false })
            .then((tab) => {
              opened = tab.id;
              return adoptAgentTab({ chatId }, tab);
            }),
      }),
  );
  sessions.abortSession(value.result.chatId!);
  const left = (await chrome.tabs.query({})).map((tab) => tab.id);
  assert.ok(opened !== undefined);
  assert.deepEqual(left, [42]);
});

test("offline, a time task is skipped without a model run", async () => {
  const online = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: false },
    configurable: true,
  });
  try {
    const { value, requests } = await withModel([{ text: "x" }], () =>
      runTimeTask(HOURLY, hooks),
    );
    assert.equal(requests, 0);
    assert.equal(value.skipped, true);
    assert.equal(value.failed, false);
  } finally {
    if (online) Object.defineProperty(globalThis, "navigator", online);
  }
});

test("a page that did not load is told by its frame, not by error text", async () => {
  Object.assign(chrome, {
    webNavigation: {
      getFrame: async ({ tabId }: { tabId: number }) => ({
        errorOccurred: tabId === 7,
      }),
    },
  });
  assert.equal(await pageUnreachable(7), true);
  assert.equal(await pageUnreachable(8), false);
});
