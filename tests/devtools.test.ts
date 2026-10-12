import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { devtoolsTool, runScriptTool } from "../src/background/tools/devtools";
import type { ToolContext } from "../src/background/tools/types";
import { cdpFixture } from "./cdp-fixture";
import { deferred } from "./tool-fixtures";

afterEach(() => mock.restoreAll());

const context = (signal?: AbortSignal) =>
  ({
    run: {},
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
