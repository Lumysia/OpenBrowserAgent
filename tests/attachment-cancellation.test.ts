import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { putAttachment } from "../src/shared/attachment-db";
import "../src/shared/sync-backends-impl";
import { executeContextAwareTool } from "../src/background/provider-tools";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { SYNC_DATA_SETTING_KEYS } from "../src/shared/sync-data-settings";
import type { AgentCapabilities } from "../src/shared/types";
import { installBrowser } from "./helpers";
import { deferred } from "./tool-fixtures";

const original = globalThis.indexedDB;
afterEach(() => {
  mock.restoreAll();
  Object.assign(globalThis, { indexedDB: original });
});

test("attachment abort while IndexedDB opens cannot commit a later write", async () => {
  let writes = 0;
  let closed = false;
  const request: any = {
    result: {
      close() {
        closed = true;
      },
      transaction() {
        writes++;
        throw new Error("Unexpected transaction");
      },
    },
  };
  Object.assign(globalThis, { indexedDB: { open: () => request } });
  const controller = new AbortController();
  const saving = putAttachment(
    { id: "fixture", metadata: {}, content: new Uint8Array([1]) },
    controller.signal,
  );
  controller.abort();
  request.onsuccess();
  await assert.rejects(saving, { name: "AbortError" });
  assert.equal(writes, 0);
  assert.equal(closed, true);
});

for (const phase of ["metadata", "content"] as const) {
  test(`uploaded attachment abort reaches the active WebDAV ${phase} fetch`, async () => {
    const { local, sync } = installBrowser();
    local.data[STORAGE_KEYS.syncBackends] = [
      {
        id: "fixture",
        name: "Fixture",
        type: "webdav",
        url: "https://example.test/",
      },
    ];
    local.data[STORAGE_KEYS.activeSyncBackendId] = "fixture";
    sync.data[STORAGE_KEYS.syncDataSettings] = {
      [SYNC_DATA_SETTING_KEYS.chatAttachments]: true,
    };
    Object.assign(globalThis, {
      indexedDB: {
        open() {
          const request: any = {
            result: {
              close() {},
              transaction() {
                const transaction: any = {
                  objectStore: () => ({ get: () => ({}) }),
                };
                queueMicrotask(() => transaction.oncomplete());
                return transaction;
              },
            },
          };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
      },
    });
    const controller = new AbortController();
    const started = deferred();
    const urls: string[] = [];
    mock.method(
      globalThis,
      "fetch",
      async (url: unknown, init?: RequestInit) => {
        urls.push(String(url));
        if (phase === "content" && urls.length === 1)
          return Response.json({ objectName: "attachments/image.png" });
        started.resolve();
        assert.equal(init?.signal, controller.signal);
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(controller.signal.reason),
            { once: true },
          );
        });
      },
    );
    const running = executeContextAwareTool({
      toolName: "readUploadedAttachment",
      input: { attachmentId: "fixture" },
      signal: controller.signal,
      capabilities: {} as AgentCapabilities,
      uploadedAttachments: [],
      availableSkills: [],
    });
    await Promise.race([
      started.promise,
      running.then(() => {
        throw new Error("Attachment read completed before reaching WebDAV");
      }),
    ]);
    controller.abort();
    await assert.rejects(running, { name: "AbortError" });
    assert.equal(urls.length, phase === "metadata" ? 1 : 2);
  });
}

test("attachment abort aborts the pending transaction and closes the database", async () => {
  let aborted = false;
  let closed = false;
  const transaction: any = {
    objectStore: () => ({ put: () => ({}) }),
    abort() {
      aborted = true;
      transaction.onabort();
    },
  };
  const request: any = {
    result: {
      close() {
        closed = true;
      },
      transaction: () => transaction,
    },
  };
  Object.assign(globalThis, { indexedDB: { open: () => request } });
  const controller = new AbortController();
  const saving = putAttachment(
    { id: "fixture", metadata: {}, content: new Uint8Array([1]) },
    controller.signal,
  );
  request.onsuccess();
  await Promise.resolve();
  controller.abort();
  await assert.rejects(saving, { name: "AbortError" });
  assert.equal(aborted, true);
  assert.equal(closed, true);
});
