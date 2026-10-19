import { getMessages } from "../src/shared/i18n.ts";
import { STORAGE_KEYS } from "../src/shared/storage-keys.ts";
import { TASK_MESSAGE } from "../src/shared/tasks/messages.ts";
import { TOOL_NAME } from "../src/shared/tool-names.ts";
import {
  fixtureProvider,
  servePages,
  startExtension,
} from "./browser-harness.mjs";
import { clickElement } from "./cdp-input.mjs";
import { poll } from "./chromium.mjs";
import { reply } from "./provider-fixtures.ts";

// Shared by the task browser tests and the real-run check: the production
// build, a local model and pages, and the side panel's task list driven
// with input events.

export const t = getMessages("en-US");

// The model requests that started a run (the last message is the user's):
// one per model run.
export const runStarts = (requests) =>
  requests.filter(
    (request) =>
      request.url === "/v1/chat/completions" &&
      request.body.messages?.at(-1)?.role === "user",
  );

export const offeredTools = (request) =>
  (request.body.tools || []).map((tool) => tool.function?.name || tool.name);

const lastUserText = (body) => {
  const content = body.messages?.findLast((m) => m.role === "user")?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
};

// A model that judges a watch: the page after the change shows the price
// it waits for, or not. Any task run reports its outcome first.
export function watchModel(metPrice) {
  return (body) => {
    const tools = body.messages.filter((m) => m.role === "tool").length;
    if (tools > 0) return { text: "Checked the page." };
    const text = lastUserText(body);
    const met = new RegExp(
      `page_after&gt;[\\s\\S]*${metPrice}|page_after>[\\s\\S]*${metPrice}`,
    ).test(text);
    return {
      calls: [
        {
          id: "result",
          name: TOOL_NAME.taskResult,
          args: {
            outcome: met ? "met" : "notMet",
            summary: met ? `The price is ${metPrice} now.` : "No drop yet.",
          },
        },
      ],
    };
  };
}

export async function startTaskExtension({ pages = {}, model, extraStorage }) {
  const session = await startExtension({
    handle: (request, response) => {
      if (request.url === "/v1/chat/completions")
        return reply(response, "openai", model(request.body, request));
      if (
        !servePages(
          typeof pages === "function" ? pages() : pages,
          request,
          response,
        )
      )
        response.writeHead(404).end();
    },
    storage: (baseUrl) => ({
      provider: { fixture: fixtureProvider(baseUrl) },
      language: "en-US",
      preferences: { selectedModelId: "fixture", autoRetry: false },
      ...extraStorage?.(baseUrl),
    }),
  });
  return session;
}

export function storageValue(page, key) {
  return page.call(
    async (key) => (await chrome.storage.local.get(key))[key],
    key,
  );
}

export function taskStates(page) {
  return storageValue(page, STORAGE_KEYS.taskStates).then(
    (value) => value || {},
  );
}

export async function thisDevice(page) {
  return poll(() => storageValue(page, STORAGE_KEYS.taskDeviceId));
}

// The notifications the extension shows (the browser's own record).
export function notifications(page) {
  return page.call(
    () => new Promise((resolve) => chrome.notifications.getAll(resolve)),
  );
}

export function runNow(page, taskId) {
  return page.call((message) => chrome.runtime.sendMessage(message), {
    type: TASK_MESSAGE.runNow,
    taskId,
  });
}

// Waits until the task finished a run after `after` (its last run time).
export function ranAfter(page, taskId, after = 0) {
  return poll(async () => {
    const state = (await taskStates(page))[taskId];
    return state && !state.running && (state.lastRunAt || 0) > after && state;
  });
}

export async function openSidePanel(browser, extensionUrl) {
  const panel = await browser.open(extensionUrl("sidepanel.html"));
  await poll(() =>
    panel.call(() => !!document.querySelector(".composer-box textarea")),
  );
  return panel;
}

// Fills a form field as typing does: focus, select what is there, insert.
export async function fill(page, selector, text) {
  await page.call((selector) => {
    const field = document.querySelector(selector);
    field.focus();
    field.select?.();
  }, selector);
  await page.send("Input.insertText", { text });
}

export async function choose(page, triggerLabel, optionText) {
  await clickElement(page, `[aria-label="${triggerLabel}"]`);
  await poll(() =>
    page.call(() => !!document.querySelector('[role="option"]')),
  );
  await clickElement(page, '[role="option"]', {
    text: optionText,
    exact: true,
  });
}

export async function openTaskList(panel) {
  await clickElement(panel, `.tasks-button`);
  await poll(() => panel.call(() => !!document.querySelector(".tasks-page")));
}

// Creates a watch through the task form.
export async function createWatchInUi(panel, { title, prompt, url, minutes }) {
  await openTaskList(panel);
  await clickElement(panel, `[aria-label="${t.tasks.newTask}"]`);
  await poll(() =>
    panel.call(() => !!document.querySelector("form.task-form")),
  );
  await choose(panel, t.tasks.form.kind, t.tasks.kinds.watch);
  await poll(() =>
    panel.call(() => !!document.querySelector('form.task-form [name="url"]')),
  );
  await fill(panel, 'form.task-form [name="title"]', title);
  await fill(panel, 'form.task-form [name="prompt"]', prompt);
  await fill(panel, 'form.task-form [name="url"]', url);
  await fill(panel, 'form.task-form [name="everyMinutes"]', String(minutes));
  await clickElement(panel, "form.task-form button[type=submit]");
  await poll(() =>
    panel.call(
      () =>
        !document.querySelector("form.task-form") &&
        !!document.querySelector(".task-item"),
    ),
  );
}

// The text of the task's row in the list.
export function taskRowText(panel, taskId) {
  return panel.call(
    (id) => document.querySelector(`[data-task-id="${id}"]`)?.textContent || "",
    taskId,
  );
}
