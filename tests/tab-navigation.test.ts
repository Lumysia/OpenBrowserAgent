import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config";
import {
  openOrFocusOptions,
  openOrFocusUrl,
} from "../src/shared/tab-navigation";
import { toolBrowser } from "./tool-fixtures";

test("openOrFocusUrl focuses an open tab without reloading it", async () => {
  toolBrowser();
  const updates: unknown[] = [];
  Object.assign(chrome.tabs, {
    query: async () => [{ id: 3, url: "https://example.test/a" }],
    update: async (_id: number, props: unknown) => {
      updates.push(props);
      return { id: 3 };
    },
  });
  await openOrFocusUrl("https://example.test/a");
  assert.deepEqual(updates, [{ active: true }]);
});

test("openOrFocusOptions focuses the settings tab already at that place", async () => {
  toolBrowser();
  const url = (hash: string) => `chrome-extension://oba/options.html${hash}`;
  Object.assign(chrome, {
    runtime: { getURL: (path: string) => `chrome-extension://oba${path}` },
  });
  const updates: [number, unknown][] = [];
  Object.assign(chrome.tabs, {
    query: async () => [
      { id: 3, url: url("#/") },
      { id: 4, url: url(OPTIONS_HASH.welcome) },
    ],
    update: async (id: number, props: unknown) => {
      updates.push([id, props]);
      return { id };
    },
  });
  await openOrFocusOptions(OPTIONS_HASH.welcome);
  assert.deepEqual(updates, [[4, { active: true }]]);
  // Elsewhere in settings: the settings tab goes there.
  updates.length = 0;
  await openOrFocusOptions(OPTIONS_HASH.sync);
  assert.deepEqual(updates, [
    [3, { active: true, url: url(OPTIONS_HASH.sync) }],
  ]);
});
