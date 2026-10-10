import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { executeCdpTool } from "../src/background/cdp-tools";
import { deferred } from "./tool-fixtures";
import { cdpFixture as fixture } from "./cdp-fixture";

afterEach(() => mock.restoreAll());
test("full-page screenshot uses CSS content bounds and emulation persists across tools until reset", async () => {
  const f = fixture();
  await executeCdpTool("cdpTakeScreenshot", {
    tabId: f.tabId,
    fullPage: true,
    format: "png",
  });
  assert.deepEqual(
    f.calls.find((call) => call.method === "Page.captureScreenshot")?.params
      .clip,
    { x: 0, y: 0, width: 800, height: 3000, scale: 1 },
  );
  await executeCdpTool("cdpPage", {
    tabId: f.tabId,
    operation: "emulate",
    viewport: "390x844,mobile",
    colorScheme: "dark",
  });
  assert.equal(f.detached.length, 1);
  const attachCount = f.attached.length;
  await executeCdpTool("cdpEvaluateScript", {
    targetId: `target-${f.tabId}`,
    function: "() => true",
  });
  assert.equal(f.attached.length, attachCount);
  assert.equal(f.detached.length, 1);
  await executeCdpTool("cdpPage", {
    tabId: f.tabId,
    operation: "emulate",
    reset: true,
  });
  assert.equal(f.detached.length, 2);
});

test("invalid emulation fails before sending overrides", async () => {
  const f = fixture();
  await assert.rejects(
    executeCdpTool("cdpPage", {
      tabId: f.tabId,
      operation: "emulate",
      viewport: "390x844xNaN",
      userAgent: "fixture",
    }),
    /Invalid viewport/,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(f.detached.length, 1);
});

test("resize retains its CDP fallback when the window API is unavailable", async () => {
  const f = fixture();
  Object.assign(chrome, {
    windows: {
      update: async () => {
        throw new Error("Window resize unavailable");
      },
    },
  });
  await executeCdpTool("cdpPage", {
    tabId: f.tabId,
    operation: "resize",
    width: 400,
    height: 600,
  });
  assert.deepEqual(f.calls[0], {
    method: "Emulation.setDeviceMetricsOverride",
    params: { width: 400, height: 600, deviceScaleFactor: 1, mobile: false },
  });
  await executeCdpTool("cdpPage", {
    tabId: f.tabId,
    operation: "emulate",
    reset: true,
  });
});

test("abort during attach detaches the late session without sending page commands", async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred();
  mock.method(chrome.debugger, "attach", async () => {
    entered.resolve();
    await release.promise;
  });
  const controller = new AbortController();
  const result = executeCdpTool(
    "cdpInput",
    { tabId: f.tabId, operation: "click", x: 1, y: 2 },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  release.resolve();
  await assert.rejects(result, { name: "AbortError" });
  await setImmediate();
  assert.equal(f.calls.length, 0);
  assert.equal(f.detached.length, 1);
});

test("abort between CDP input commands prevents later mouse effects and detaches", async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred<any>();
  mock.method(chrome.debugger, "sendCommand", async (_target, method) => {
    f.calls.push({ method });
    entered.resolve();
    return release.promise;
  });
  const controller = new AbortController();
  const result = executeCdpTool(
    "cdpInput",
    { tabId: f.tabId, operation: "click" },
    controller.signal,
  );
  await entered.promise;
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  release.resolve({});
  await setImmediate();
  assert.deepEqual(
    f.calls.map((call) => call.method),
    ["Input.dispatchMouseEvent"],
  );
  assert.equal(f.detached.length, 1);
});

test("dangerous script isolated-world contract sets the CDP execution context", async () => {
  const f = fixture();
  mock.method(
    chrome.debugger,
    "sendCommand",
    async (_target, method, params) => {
      f.calls.push({ method, params });
      if (method === "Page.getFrameTree")
        return { frameTree: { frame: { id: "frame" } } };
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 7 };
      return { result: { value: { success: true, value: 1 } } };
    },
  );
  await executeCdpTool("cdpExecuteArbitraryJavaScript", {
    tabId: f.tabId,
    code: "1",
    world: "ISOLATED",
  });
  assert.equal(f.calls.at(-1)?.params.contextId, 7);
});

test("a canceled queued CDP operation cannot attach or send after the previous operation finishes", async () => {
  const f = fixture();
  const entered = deferred();
  const release = deferred<any>();
  mock.method(chrome.debugger, "sendCommand", async (_target, method) => {
    f.calls.push({ method });
    entered.resolve();
    return release.promise;
  });
  const first = executeCdpTool("cdpTakeScreenshot", { tabId: f.tabId });
  await entered.promise;
  const controller = new AbortController();
  const second = executeCdpTool(
    "cdpInput",
    { targetId: `target-${f.tabId}`, operation: "click" },
    controller.signal,
  );
  await setImmediate();
  controller.abort();
  await assert.rejects(second, { name: "AbortError" });
  release.resolve({ data: "AA==" });
  await first;
  await setImmediate();
  assert.equal(f.attached.length, 1);
  assert.deepEqual(
    f.calls.map((call) => call.method),
    ["Page.captureScreenshot"],
  );
});
