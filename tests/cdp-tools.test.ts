import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { executeCdpTool, isCdpTool } from "../src/background/cdp-tools";
import { executeContextAwareTool } from "../src/background/provider-tools";
import type { AgentCapabilities } from "../src/shared/types";
import { cdpFixture } from "./cdp-fixture";
import { deferred } from "./tool-fixtures";

afterEach(() => mock.restoreAll());

const methods = (f: ReturnType<typeof cdpFixture>) =>
  f.calls.map((call) => call.method);

test("full-page screenshot uses CSS content bounds; emulation persists until reset", async () => {
  const f = cdpFixture();
  await executeCdpTool("cdpTakeScreenshot", {
    tabId: 501,
    fullPage: true,
    format: "png",
  });
  assert.deepEqual(
    f.calls.find((call) => call.method === "Page.captureScreenshot")?.params
      .clip,
    { x: 0, y: 0, width: 800, height: 3000, scale: 1 },
  );
  await executeCdpTool("cdpPage", {
    tabId: 501,
    operation: "emulate",
    viewport: "390x844,mobile",
  });
  // The same page by targetId reuses the retained session.
  await executeCdpTool("cdpTakeScreenshot", { targetId: "page-1" });
  assert.equal(f.attaches.length, 2);
  assert.equal(f.detaches.length, 1);
  await executeCdpTool("cdpPage", {
    tabId: 501,
    operation: "emulate",
    reset: true,
  });
  assert.equal(f.detaches.length, 2);
  assert.equal(f.attached.size, 0);
});

test("a retained session closed by Chrome is attached again on next use", async () => {
  const f = cdpFixture();
  await executeCdpTool("cdpPage", {
    tabId: 501,
    operation: "emulate",
    colorScheme: "dark",
  });
  f.drop({ tabId: 501 });
  await executeCdpTool("cdpTakeScreenshot", { tabId: 501 });
  assert.equal(f.attaches.length, 2);
  assert.equal(f.attached.size, 0);
});

test("abort during attach detaches the late session without page commands", async () => {
  const f = cdpFixture();
  const entered = deferred();
  const release = deferred();
  const attach = f.api.attach;
  mock.method(f.api, "attach", async (target: chrome.debugger.Debuggee) => {
    entered.resolve();
    await release.promise;
    return attach(target);
  });
  const controller = new AbortController();
  const result = executeCdpTool(
    "cdpInput",
    { tabId: 501, operation: "click", x: 1, y: 2 },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  release.resolve();
  await assert.rejects(result, { name: "AbortError" });
  assert.deepEqual(f.calls, []);
  assert.equal(f.attached.size, 0);
});

test("abort between input events stops later mouse events and detaches", async () => {
  const f = cdpFixture();
  const entered = deferred();
  const release = deferred<any>();
  mock.method(f.api, "sendCommand", async (target: any, method: string) => {
    f.calls.push({ target, method });
    entered.resolve();
    return release.promise;
  });
  const controller = new AbortController();
  const result = executeCdpTool(
    "cdpInput",
    { tabId: 501, operation: "click" },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  release.resolve({});
  await setImmediate();
  assert.deepEqual(methods(f), ["Input.dispatchMouseEvent"]);
  assert.equal(f.attached.size, 0);
});

test("navigate without a tab id drives the active tab, not a tab whose URL matches", async () => {
  const f = cdpFixture([
    { id: "active", tabId: 501 },
    { id: "other", tabId: 502, url: "https://example.com/inbox" },
  ]);
  await executeCdpTool("cdpPage", {
    operation: "navigate",
    url: "https://example.com",
  });
  assert.deepEqual(
    f.calls
      .filter((call) => call.method === "Page.navigate")
      .map((call) => call.target),
    [{ tabId: 501 }],
  );
});

test("a targetId/tabId pair naming different pages produces no effects", async () => {
  const f = cdpFixture([
    { id: "page-1", tabId: 501 },
    { id: "page-2", tabId: 502 },
  ]);
  await assert.rejects(
    executeCdpTool("cdpInput", {
      operation: "click",
      targetId: "page-1",
      tabId: 502,
    }),
    /different pages/,
  );
  assert.deepEqual(f.attaches, []);
});

test("back at the first history entry sends no navigation", async () => {
  const f = cdpFixture();
  mock.method(f.api, "sendCommand", async (target: any, method: string) => {
    f.calls.push({ target, method });
    return { currentIndex: 0, entries: [{ id: 11 }, { id: 22 }] };
  });
  const result = await executeCdpTool("cdpPage", {
    operation: "navigate",
    type: "back",
    tabId: 501,
  });
  assert.equal((result as any).success, false);
  assert.deepEqual(methods(f), ["Page.getNavigationHistory"]);
});

test("key presses carry the text Chromium needs for their default action", async () => {
  const f = cdpFixture();
  for (const key of ["Enter", "a", "Control+A", "Backspace"])
    await executeCdpTool("cdpInput", { tabId: 501, operation: "key", key });
  assert.deepEqual(
    f.calls
      .filter((call) => call.params?.type === "keyDown")
      .map((call) => call.params.text),
    ["\r", "a", undefined, undefined],
  );
});

test("missing isolated execution context cannot fall through to main-world evaluation", async () => {
  const f = cdpFixture();
  const send = f.api.sendCommand;
  mock.method(
    f.api,
    "sendCommand",
    async (target: any, method: string, params: any) => {
      if (method === "Page.createIsolatedWorld") return {};
      return send(target, method, params);
    },
  );
  await assert.rejects(
    executeCdpTool("cdpExecuteArbitraryJavaScript", {
      tabId: 501,
      code: "document.body.remove()",
      world: "ISOLATED",
    }),
    /isolated execution context/,
  );
  assert.equal(methods(f).includes("Runtime.evaluate"), false);
  assert.equal(f.attached.size, 0);
});

test("abort during isolated-world creation prevents evaluation after a late result", async () => {
  const f = cdpFixture();
  const entered = deferred();
  const world = deferred<any>();
  const send = f.api.sendCommand;
  mock.method(
    f.api,
    "sendCommand",
    async (target: any, method: string, params: any) => {
      if (method !== "Page.createIsolatedWorld")
        return send(target, method, params);
      f.calls.push({ target, method });
      entered.resolve();
      return world.promise;
    },
  );
  const controller = new AbortController();
  const running = executeCdpTool(
    "cdpExecuteArbitraryJavaScript",
    { tabId: 501, code: "document.body.remove()", world: "ISOLATED" },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  world.resolve({ executionContextId: 77 });
  await setImmediate();
  assert.deepEqual(methods(f), [
    "Page.getFrameTree",
    "Page.createIsolatedWorld",
  ]);
});

test("page JavaScript is unreachable when its capability is off or via other CDP tools", async () => {
  const f = cdpFixture();
  const result = await executeContextAwareTool({
    toolName: "cdpExecuteArbitraryJavaScript",
    input: { tabId: 501, code: "document.body.remove()" },
    uploadedAttachments: [],
    availableSkills: [],
    capabilities: { javascriptExecution: false } as AgentCapabilities,
  });
  assert.equal((result as any).success, false);
  assert.equal(isCdpTool("cdpEvaluateScript"), false);
  const evaluated = await executeCdpTool("cdpEvaluateScript", {
    tabId: 501,
    function: "() => document.body.remove()",
  });
  assert.equal((evaluated as any).success, false);
  assert.deepEqual(f.attaches, []);
});
