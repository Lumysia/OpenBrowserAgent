import assert from "node:assert/strict";
import { test } from "node:test";
import { openOrFocusUrl } from "../src/shared/tab-navigation";
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
