import assert from "node:assert/strict";
import { test } from "node:test";
import {
  syncContentScript,
  type ContentScript,
} from "../src/background/content-script-registration";
import { webPagesExcept } from "../src/shared/site-hosts";
import { fakeTabs, installChrome } from "./fake-chrome";

type Registered = chrome.scripting.RegisteredContentScript;

// chrome.scripting with registrations in memory; `injected` lists each
// executeScript's tab and target.
function fakeScripting({ originFallback = true } = {}) {
  const registered = new Map<string, Registered>();
  const injected: Array<{ tabId: number; allFrames: boolean }> = [];
  const calls: string[] = [];
  const api = {
    async getRegisteredContentScripts({ ids }: { ids: string[] }) {
      return ids
        .filter((id) => registered.has(id))
        .map((id) => structuredClone(registered.get(id)!));
    },
    async registerContentScripts(scripts: Registered[]) {
      calls.push("register");
      for (const script of scripts) {
        if (script.matchOriginAsFallback && !originFallback)
          throw new Error("Unexpected property: 'matchOriginAsFallback'.");
        if (registered.has(script.id)) throw new Error("Duplicate script ID");
        registered.set(script.id, structuredClone(script));
      }
    },
    async updateContentScripts(scripts: Registered[]) {
      calls.push("update");
      for (const script of scripts)
        registered.set(script.id, structuredClone(script));
    },
    async unregisterContentScripts({ ids }: { ids: string[] }) {
      calls.push("unregister");
      for (const id of ids) registered.delete(id);
    },
    async executeScript({
      target,
    }: {
      target: { tabId: number; allFrames?: boolean };
    }) {
      injected.push({ tabId: target.tabId, allFrames: !!target.allFrames });
      return [];
    },
  };
  return { api, registered, injected, calls };
}

const TABS = [
  { id: 1, url: "https://example.com/a" },
  { id: 2, url: "https://docs.example.org/b" },
  { id: 3, url: "chrome-extension://abc/options.html" },
  { id: 4, url: "http://news.example.net/" },
];

function setup(options?: { originFallback?: boolean }) {
  const scripting = fakeScripting(options);
  const tabs = fakeTabs(TABS);
  installChrome({ scripting: scripting.api, tabs: tabs.api });
  return scripting;
}

const TOP_FRAME: ContentScript = {
  id: "test-top",
  file: "content-scripts/test.js",
  allFrames: false,
};

test("a page script is registered while its setting is on and reaches open web pages once", async () => {
  const scripting = setup();
  await syncContentScript(TOP_FRAME, undefined);
  assert.equal(scripting.registered.size, 0);
  assert.deepEqual(scripting.calls, []);

  await syncContentScript(TOP_FRAME, webPagesExcept(["example.org"]));
  const script = scripting.registered.get(TOP_FRAME.id)!;
  assert.deepEqual(script.js, [TOP_FRAME.file]);
  assert.deepEqual(script.matches, ["http://*/*", "https://*/*"]);
  assert.deepEqual(script.excludeMatches, ["*://*.example.org/*"]);
  assert.equal(script.allFrames, false);
  assert.equal(script.persistAcrossSessions, true);
  // Web pages it covers, top frame only; not the excluded site nor
  // extension pages.
  assert.deepEqual(scripting.injected, [
    { tabId: 1, allFrames: false },
    { tabId: 4, allFrames: false },
  ]);

  // The same patterns again: nothing to do.
  await syncContentScript(TOP_FRAME, webPagesExcept(["example.org"]));
  assert.deepEqual(scripting.calls, ["register"]);
  assert.equal(scripting.injected.length, 2);

  // A site taken off the list gets the script; the others have it already.
  scripting.injected.length = 0;
  await syncContentScript(TOP_FRAME, webPagesExcept(["example.net"]));
  assert.deepEqual(scripting.calls, ["register", "update"]);
  assert.deepEqual(scripting.registered.get(TOP_FRAME.id)?.excludeMatches, [
    "*://*.example.net/*",
  ]);
  assert.deepEqual(scripting.injected, [{ tabId: 2, allFrames: false }]);

  await syncContentScript(TOP_FRAME, undefined);
  assert.equal(scripting.registered.size, 0);
  assert.deepEqual(scripting.calls, ["register", "update", "unregister"]);
});

test("frames without their own origin are asked for where the browser has them", async () => {
  const script: ContentScript = {
    id: "test-frames",
    file: "content-scripts/frames.js",
    allFrames: true,
    matchOriginAsFallback: true,
  };
  const supported = setup();
  await syncContentScript(script, webPagesExcept([]));
  assert.equal(
    supported.registered.get(script.id)?.matchOriginAsFallback,
    true,
  );
  assert.deepEqual(supported.injected, [
    { tabId: 1, allFrames: true },
    { tabId: 2, allFrames: true },
    { tabId: 4, allFrames: true },
  ]);

  const unsupported = setup({ originFallback: false });
  await syncContentScript(script, webPagesExcept([]));
  const registered = unsupported.registered.get(script.id);
  assert.ok(registered);
  assert.equal(registered.matchOriginAsFallback, undefined);
});

test("browsers without dynamic registration get no page script", async () => {
  const tabs = fakeTabs(TABS);
  installChrome({ scripting: {}, tabs: tabs.api });
  await syncContentScript(TOP_FRAME, webPagesExcept([]));
});
