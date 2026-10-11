import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { toolBrowser, deferred } from "./tool-fixtures";
import { executeContextAwareTool } from "../src/background/provider-tools";
import type { AgentCapabilities } from "../src/shared/types";
import { imageModelFixture } from "./image-fixture";
import { generateImage } from "../src/background/image-generation";
import { writeWebDavObject } from "../src/shared/sync-backends-impl";

afterEach(() => mock.restoreAll());

async function tool(
  name: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return executeContextAwareTool({
    toolName: name,
    input,
    signal,
    capabilities: { javascriptExecution: true } as AgentCapabilities,
    uploadedAttachments: [],
    availableSkills: [],
  });
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
    ["manageTabs", { operation: "close", tabId: 1 }],
    ["readFileFromUrl", { url: "https://example.test" }],
  ] as const)
    await assert.rejects(async () => tool(name, args, controller.signal), {
      name: "AbortError",
    });
  assert.equal(effects, 0);
});

test("abort after DOM click resolution prevents opening its link", async () => {
  toolBrowser();
  const started = deferred();
  const release = deferred<any>();
  let opened = 0;
  mock.method(chrome.scripting, "executeScript", async () => {
    started.resolve();
    return release.promise;
  });
  Object.assign(chrome.tabs, {
    create: async () => {
      opened++;
    },
  });
  const controller = new AbortController();
  const running = tool(
    "mutatePage",
    { tabId: 1, operation: "click" },
    controller.signal,
  );
  await started.promise;
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  release.resolve([
    {
      result: {
        success: true,
        newTab: true,
        url: "https://example.test/new",
      },
    },
  ]);
  await setImmediate();
  assert.equal(opened, 0);
});

for (const name of [
  "readFileFromUrl",
  "downloadAllImagesInTab",
  "generateImage",
])
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
    const running = tool(
      name,
      { tabId: 1, url: "https://example.test/image", prompt: "fixture" },
      controller.signal,
    );
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

test("attachment upload cancellation stops collection creation and prevents later PUTs", async () => {
  const started = deferred();
  const controller = new AbortController();
  const methods: string[] = [];
  mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      methods.push(String(init?.method));
      started.resolve();
      return new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        ),
      );
    },
  );
  const running = writeWebDavObject(
    {
      id: "fixture",
      name: "fixture",
      type: "webdav",
      url: "https://example.test/",
    },
    "attachments/month/image.png",
    new Uint8Array([1]),
    "image/png",
    controller.signal,
  );
  await started.promise;
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  assert.deepEqual(methods, ["MKCOL"]);
});
