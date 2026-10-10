import assert from "node:assert/strict";
import { test } from "node:test";
import { openDefaultSearchTab } from "../src/background/browser-search";
import { toolBrowser, deferred } from "./tool-fixtures";

test("default search queries and returns its created tab", async () => {
  toolBrowser();
  Object.assign(chrome.tabs, {
    create: async () => ({ id: 42 }),
    get: async (id: number) => ({ id, url: "https://example.test/search" }),
  });
  Object.assign(chrome, {
    search: {
      query: async (args: unknown) =>
        assert.deepEqual(args, { text: "query", tabId: 42 }),
    },
  });
  assert.equal((await openDefaultSearchTab("query")).id, 42);
});

test("abort during search tab creation closes the owned tab without starting a search", async () => {
  toolBrowser();
  const created = deferred<any>();
  const removed: number[] = [];
  let searched = false;
  Object.assign(chrome.tabs, {
    create: () => created.promise,
    remove: async (id: number) => {
      removed.push(id);
    },
  });
  Object.assign(chrome, {
    search: {
      query: async () => {
        searched = true;
      },
    },
  });
  const controller = new AbortController();
  const running = openDefaultSearchTab("query", controller.signal);
  controller.abort();
  created.resolve({ id: 42 });
  await assert.rejects(running, { name: "AbortError" });
  assert.equal(searched, false);
  assert.deepEqual(removed, [42]);
});

test("abort during final search tab lookup closes the owned tab", async () => {
  toolBrowser();
  const lookupStarted = deferred<void>();
  const lookup = deferred<{ id: number }>();
  const removed: number[] = [];
  Object.assign(chrome.tabs, {
    create: async () => ({ id: 42 }),
    get: (id: number) => {
      assert.equal(id, 42);
      lookupStarted.resolve();
      return lookup.promise;
    },
    remove: async (id: number) => {
      removed.push(id);
    },
  });
  Object.assign(chrome, { search: { query: async () => {} } });
  const controller = new AbortController();
  const running = openDefaultSearchTab("query", controller.signal);
  await lookupStarted.promise;
  controller.abort();
  lookup.resolve({ id: 42 });
  await assert.rejects(running, { name: "AbortError" });
  assert.deepEqual(removed, [42]);
});
