import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createRunTab } from "../src/background/run-tab";
import { devtoolsTool, runScriptTool } from "../src/background/tools/devtools";
import type { ToolContext } from "../src/background/tools/types";
import { cdpFixture } from "./cdp-fixture";
import { deferred } from "./tool-fixtures";

afterEach(() => mock.restoreAll());

const context = (signal?: AbortSignal) =>
  ({
    run: { tab: createRunTab("chat") },
    toolCallId: "call",
    signal,
    progress() {},
  }) as unknown as ToolContext;
const methods = (f: ReturnType<typeof cdpFixture>) =>
  f.calls.map((call) => call.method);

test("emulation keeps its debugger session until reset or until Chrome drops it", async () => {
  const f = cdpFixture();
  await devtoolsTool.execute(
    { action: "emulate", tabId: 501, viewport: "390x844,mobile" },
    context(),
  );
  assert.equal(f.attached.size, 1);
  await devtoolsTool.execute({ action: "resources", tabId: 501 }, context());
  assert.equal(f.attaches.length, 1);
  f.drop({ tabId: 501 });
  await devtoolsTool.execute({ action: "resources", tabId: 501 }, context());
  assert.equal(f.attaches.length, 2);
  assert.equal(f.attached.size, 0);
  await devtoolsTool.execute(
    { action: "emulate", tabId: 501, colorScheme: "dark" },
    context(),
  );
  await devtoolsTool.execute({ action: "reset", tabId: 501 }, context());
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
  const result = runScriptTool.execute(
    { tabId: 501, code: "1" },
    context(controller.signal),
  );
  await entered.promise;
  controller.abort();
  release.resolve();
  await assert.rejects(result, { name: "AbortError" });
  assert.deepEqual(f.calls, []);
  assert.equal(f.attached.size, 0);
});

test("a missing isolated context never falls through to main-world evaluation", async () => {
  const f = cdpFixture();
  const send = f.api.sendCommand;
  mock.method(
    f.api,
    "sendCommand",
    async (target: any, method: string, params: any) =>
      method === "Page.createIsolatedWorld" ? {} : send(target, method, params),
  );
  await assert.rejects(
    runScriptTool.execute(
      { tabId: 501, code: "document.body.remove()", world: "ISOLATED" },
      context(),
    ),
    /isolated execution context/,
  );
  assert.equal(methods(f).includes("Runtime.evaluate"), false);
  assert.equal(f.attached.size, 0);
});

test("abort during isolated-world creation prevents a late evaluation", async () => {
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
  const running = runScriptTool.execute(
    { tabId: 501, code: "document.body.remove()", world: "ISOLATED" },
    context(controller.signal),
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

test("a mobile viewport also sets the screen size and touch, and reset undoes them", async () => {
  const f = cdpFixture();
  const result = await devtoolsTool.execute(
    { action: "emulate", tabId: 501, viewport: "390x844x3,mobile" },
    context(),
  );
  assert.deepEqual(
    f.calls.map(({ method, params }) => [method, params]),
    [
      [
        "Emulation.setDeviceMetricsOverride",
        {
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          mobile: true,
          screenWidth: 390,
          screenHeight: 844,
        },
      ],
      [
        "Emulation.setTouchEmulationEnabled",
        { enabled: true, maxTouchPoints: 5 },
      ],
    ],
  );
  assert.equal(
    result.text,
    'Emulating on tab 501: viewport 390x844 at device scale 3, mobile; screen size 390x844; touch on; user agent unchanged (pass userAgent to set one). This lasts until {"action":"reset"}, the debugger detaching, or the tab closing.',
  );
  assert.deepEqual(result.details?.screen, { width: 390, height: 844 });
  assert.equal(result.details?.touch, true);
  assert.doesNotMatch(result.text, /reset=true/);

  f.calls.length = 0;
  const reset = await devtoolsTool.execute(
    { action: "reset", tabId: 501 },
    context(),
  );
  assert.deepEqual(
    f.calls.map(({ method, params }) => [method, params]),
    [
      ["Emulation.clearDeviceMetricsOverride", undefined],
      ["Emulation.setTouchEmulationEnabled", { enabled: false }],
      ["Emulation.setEmulatedMedia", { features: [] }],
    ],
  );
  assert.equal(f.attached.size, 0);
  assert.equal(reset.details?.reset, true);
  const again = await devtoolsTool.execute(
    { action: "reset", tabId: 501 },
    context(),
  );
  assert.match(again.text, /Nothing was emulated on tab 501/);
});

test("a desktop viewport keeps the real screen and turns touch off; a user agent is listed", async () => {
  const f = cdpFixture();
  const result = await devtoolsTool.execute(
    {
      action: "emulate",
      tabId: 501,
      viewport: "1280x800",
      userAgent: "Fixture/1.0",
      colorScheme: "dark",
    },
    context(),
  );
  assert.deepEqual(
    f.calls.map(({ method }) => method),
    [
      "Emulation.setDeviceMetricsOverride",
      "Emulation.setTouchEmulationEnabled",
      "Network.setUserAgentOverride",
      "Emulation.setEmulatedMedia",
    ],
  );
  assert.equal(f.calls[0].params.screenWidth, 0);
  assert.deepEqual(f.calls[1].params, { enabled: false });
  assert.match(
    result.text,
    /viewport 1280x800 at device scale 1, desktop; screen size not overridden; touch off; user agent "Fixture\/1\.0"; color scheme dark\./,
  );
  await devtoolsTool.execute({ action: "reset", tabId: 501 }, context());
});

test("devtools texts name the reset action as it is called", async () => {
  cdpFixture();
  await assert.rejects(
    devtoolsTool.execute({ action: "emulate", tabId: 501 }, context()),
    (error: Error) =>
      error.message.includes('{"action":"reset"}') &&
      !error.message.includes("reset=true"),
  );
  assert.doesNotMatch(devtoolsTool.description, /reset=true/);
});
