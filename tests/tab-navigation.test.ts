import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS_HASH } from "../src/shared/config";
import {
  focusTabOrUrl,
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

test("focusTabOrUrl focuses the tab while it shows the URL, else the URL", async () => {
  toolBrowser([
    { id: 3, url: "https://example.test/a" },
    { id: 4, url: "https://example.test/b" },
  ]);
  Object.assign(chrome, { windows: { update: async () => undefined } });
  const active = async () => (await chrome.tabs.query({ active: true }))[0]?.id;
  await focusTabOrUrl(3, "https://example.test/a");
  assert.equal(await active(), 3);
  // The tab went elsewhere: the tab at the URL instead.
  await chrome.tabs.update(3, { url: "https://example.test/c" });
  await focusTabOrUrl(3, "https://example.test/b");
  assert.equal(await active(), 4);
  // Closed, and no tab at the URL: a new tab opens there.
  await focusTabOrUrl(9, "https://example.test/d");
  const opened = (await chrome.tabs.query({ active: true }))[0];
  assert.equal(opened?.url, "https://example.test/d");
});
