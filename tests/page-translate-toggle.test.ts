import assert from "node:assert/strict";
import { test } from "node:test";
import { togglePageTranslation } from "../src/background/page-translate";
import { PAGE_TOAST_SCRIPT } from "../src/shared/page-toast";
import { PAGE_TRANSLATE_SCRIPT } from "../src/shared/page-translate/protocol";
import { installChrome } from "./fake-chrome";

// A tab whose page never answers; `scriptable`: whether the browser lets the
// extension run scripts there.
function installTab(scriptable: boolean) {
  const injected: unknown[] = [];
  const badges: string[] = [];
  installChrome({
    runtime: { getManifest: () => ({}) },
    tabs: { sendMessage: async () => Promise.reject(new Error("No receiver")) },
    scripting: {
      executeScript: async (details: {
        files?: string[];
        args?: unknown[];
      }) => {
        if (!scriptable) throw new Error("Cannot access contents of the page");
        injected.push(details.files ?? details.args);
        // The page note's script answers that it showed the note.
        return [{ frameId: 0, result: true }];
      },
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => {
        if (text) badges.push(text);
      },
      setTitle: async ({ title }: { title: string }) => badges.push(title),
    },
  });
  return { injected, badges };
}

test("a page script that doesn't start says so on the page", async () => {
  const { injected, badges } = installTab(true);
  await togglePageTranslation({ id: 7 } as chrome.tabs.Tab);
  assert.deepEqual(injected[0], [PAGE_TRANSLATE_SCRIPT]);
  assert.deepEqual(injected[1], [PAGE_TOAST_SCRIPT]);
  const [, message, theme, options] = injected[2] as unknown[];
  assert.equal(
    message,
    "Couldn't start translating this page. Reload the page and try again.",
  );
  assert.deepEqual(theme, { colorScheme: "system", accentColor: "pink" });
  assert.deepEqual(options, { tone: "error", durationMs: 8000 });
  assert.deepEqual(badges, []);
});

test("a page that can't be scripted gets a note on the toolbar button", async () => {
  const { injected, badges } = installTab(false);
  await togglePageTranslation({ id: 7 } as chrome.tabs.Tab);
  assert.deepEqual(injected, []);
  assert.deepEqual(badges, [
    "!",
    "Can't translate this page: the browser doesn't let extensions change it.",
  ]);
});
