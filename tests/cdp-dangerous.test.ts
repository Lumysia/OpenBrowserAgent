import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { executeCdpTool } from "../src/background/cdp-tools";
import { executeContextAwareTool } from "../src/background/provider-tools";
import type { AgentCapabilities } from "../src/shared/types";
import { lifecycleFixture } from "./cdp-lifecycle-fixture";
import { deferred } from "./tool-fixtures";

afterEach(() => mock.restoreAll());

test("missing isolated execution context cannot fall through to main-world evaluation", async () => {
  const f = lifecycleFixture();
  const send = f.api.sendCommand;
  mock.method(f.api, "sendCommand", async (target, method, params) => {
    if (method === "Page.createIsolatedWorld") return {};
    return send(target, method, params);
  });
  await assert.rejects(
    executeCdpTool("cdpExecuteArbitraryJavaScript", {
      targetId: "page-1",
      code: "document.body.remove()",
      world: "ISOLATED",
    }),
    /isolated execution context/,
  );
  assert.equal(
    f.calls.some((call) => call.method === "Runtime.evaluate"),
    false,
  );
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("disabled dangerous-script capability cannot attach or dispatch any CDP command", async () => {
  const f = lifecycleFixture();
  const result = await executeContextAwareTool({
    toolName: "cdpExecuteArbitraryJavaScript",
    input: { tabId: 501, code: "document.body.remove()" },
    uploadedAttachments: [],
    availableSkills: [],
    capabilities: { javascriptExecution: false } as AgentCapabilities,
  });
  assert.equal((result as any).success, false);
  assert.deepEqual(f.attaches, []);
  assert.deepEqual(f.calls, []);
});

for (const stop of ["abort", "detach"] as const) {
  test(`${stop} during isolated-world creation prevents dangerous evaluation after a late result`, async () => {
    const f = lifecycleFixture();
    const entered = deferred();
    const world = deferred<any>();
    const send = f.api.sendCommand;
    mock.method(f.api, "sendCommand", async (target, method, params) => {
      if (method === "Page.createIsolatedWorld") {
        f.calls.push({ target, method });
        entered.resolve();
        return world.promise;
      }
      return send(target, method, params);
    });
    const controller = new AbortController();
    const running = executeCdpTool(
      "cdpExecuteArbitraryJavaScript",
      { targetId: "page-1", code: "document.body.remove()", world: "ISOLATED" },
      controller.signal,
    );
    await entered.promise;
    if (stop === "abort") controller.abort();
    else f.drop({ tabId: 501 });
    await assert.rejects(
      running,
      stop === "abort" ? { name: "AbortError" } : /session detached/,
    );
    world.resolve({ executionContextId: 77 });
    await setImmediate();
    assert.deepEqual(
      f.calls.map((call) => call.method),
      ["Page.getFrameTree", "Page.createIsolatedWorld"],
    );
    assert.equal(f.api.onDetach.listeners.size, 0);
  });
}
