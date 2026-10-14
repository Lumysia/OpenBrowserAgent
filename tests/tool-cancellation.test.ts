import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { toolBrowser, deferred } from "./tool-fixtures";
import { BUILTIN_TOOLS } from "../src/background/tools/registry";
import { runTool } from "../src/background/tools/run-tool";
import type { ToolContext } from "../src/background/tools/types";
import { imageModelFixture } from "./image-fixture";
import { generateImage } from "../src/background/image-generation";

afterEach(() => mock.restoreAll());

async function tool(
  name: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const definition = BUILTIN_TOOLS.find((item) => item.name === name)!;
  const context = {
    run: { chatId: "fixture", attachments: [] },
    toolCallId: "call",
    signal,
    progress() {},
  } as unknown as ToolContext;
  return runTool(definition, input, context, { current: [] });
}

test("pre-aborted dispatch cannot close tabs or start fetches", async () => {
  toolBrowser();
  let effects = 0;
  Object.assign(chrome.tabs, {
    remove: async () => {
      effects++;
    },
  });
  mock.method(globalThis, "fetch", async () => {
    effects++;
    return new Response();
  });
  const controller = new AbortController();
  controller.abort();
  for (const [name, args] of [
    ["tabs", { action: "close", tabId: 1 }],
    ["read", { source: "https://example.test" }],
  ] as const)
    await assert.rejects(async () => tool(name, args, controller.signal), {
      name: "AbortError",
    });
  assert.equal(effects, 0);
});

for (const [name, input] of [
  ["read", { source: "https://example.test/image" }],
  ["downloads", { action: "images", tabId: 1 }],
  ["generateImage", { prompt: "fixture" }],
] as const)
  test(`${name} cancels an active fetch and cannot continue to downloads`, async () => {
    toolBrowser();
    imageModelFixture();
    mock.method(
      chrome.scripting,
      "executeScript",
      async () =>
        [
          {
            result: [
              { src: "https://example.test/1.png", alt: "one", index: 0 },
              { src: "https://example.test/2.png", alt: "two", index: 1 },
            ],
          },
        ] as any,
    );
    let downloads = 0;
    let fetched = 0;
    let fetchAborted = false;
    mock.method(chrome.downloads, "download", async () => {
      downloads++;
      return 7;
    });
    const started = deferred();
    mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, init?: RequestInit) => {
        fetched++;
        started.resolve();
        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => {
              fetchAborted = true;
              reject(init.signal!.reason);
            },
            { once: true },
          ),
        );
      },
    );
    const controller = new AbortController();
    const running = tool(name, input, controller.signal);
    await started.promise;
    controller.abort();
    await assert.rejects(running, { name: "AbortError" });
    assert.equal(fetchAborted, true);
    assert.equal(fetched, 1);
    assert.equal(downloads, 0);
  });

test("late image response after abort cannot start attachment persistence", async () => {
  imageModelFixture();
  const started = deferred();
  const response = deferred<Response>();
  mock.method(globalThis, "fetch", async () => {
    started.resolve();
    return response.promise;
  });
  let opened = 0;
  Object.assign(globalThis, {
    indexedDB: {
      open: () => {
        opened++;
        throw new Error("unexpected persistence");
      },
    },
  });
  const controller = new AbortController();
  const running = generateImage(
    [],
    { prompt: "fixture" },
    { chatId: "fixture", messageId: "image" },
    controller.signal,
  );
  await started.promise;
  controller.abort();
  response.resolve(Response.json({ data: [{ b64_json: "AA==" }] }));
  await assert.rejects(running, { name: "AbortError" });
  assert.equal(opened, 0);
});
