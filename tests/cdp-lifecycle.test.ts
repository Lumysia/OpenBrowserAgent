import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { executeCdpTool } from "../src/background/cdp-tools";
import { lifecycleFixture } from "./cdp-lifecycle-fixture";
import { deferred } from "./tool-fixtures";

afterEach(() => mock.restoreAll());
const evaluate = (args: Record<string, unknown>, signal?: AbortSignal) =>
  executeCdpTool("cdpEvaluateScript", { ...args, function: "() => 1" }, signal);
const emulate = (args: Record<string, unknown>) =>
  executeCdpTool("cdpPage", { operation: "emulate", ...args });

test("an implicit selection stays on its original page while queued behind another tool", async () => {
  const f = lifecycleFixture([
    { id: "page-1", tabId: 501 },
    { id: "page-2", tabId: 502 },
  ]);
  const entered = deferred();
  const release = deferred<any>();
  const send = f.api.sendCommand;
  mock.method(f.api, "sendCommand", async (target, method, params) => {
    if (method === "Runtime.evaluate") {
      entered.resolve();
      return release.promise;
    }
    return send(target, method, params);
  });
  const first = evaluate({ tabId: 501 });
  await entered.promise;
  const second = executeCdpTool("cdpInput", { operation: "click", x: 1, y: 2 });
  await setImmediate();
  chrome.tabs.query = async () => [{ id: 502 }] as chrome.tabs.Tab[];
  release.resolve({ result: { value: 1 } });
  await Promise.all([first, second]);
  const effects = f.calls.filter((call) => call.method.startsWith("Input."));
  assert.ok(effects.length > 0);
  assert.ok(
    effects.every(
      (call) => call.target.targetId === "page-1" || call.target.tabId === 501,
    ),
  );
});

test("a synchronous detach rejection also retains ownership for a successful retry", async () => {
  const f = lifecycleFixture();
  await emulate({ tabId: 501, viewport: "390x844" });
  const detach = f.api.detach;
  mock.method(f.api, "detach", () => {
    throw new Error("Synchronous detach failure");
  });
  await assert.rejects(
    emulate({ tabId: 501, reset: true }),
    /cleanup is unconfirmed/,
  );
  mock.method(f.api, "detach", detach);
  await emulate({ targetId: "page-1", reset: true });
  assert.equal(f.states[0].attached, false);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("target-only pages remain usable without any active tab", async () => {
  const f = lifecycleFixture([{ id: "target-only", tabId: undefined }]);
  assert.equal(((await evaluate({})) as any).result, "fixture result");
  assert.deepEqual(f.attaches, [{ targetId: "target-only" }]);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

for (const route of ["target", "tab"] as const) {
  test(`explicit ${route} selection retains the alternate route for the same page`, async () => {
    const f = lifecycleFixture();
    f.failures.routes.add(route);
    const args = route === "target" ? { targetId: "page-1" } : { tabId: 501 };
    assert.equal(((await evaluate(args)) as any).result, "fixture result");
    assert.deepEqual(
      f.attaches,
      route === "target"
        ? [{ targetId: "page-1" }, { tabId: 501 }]
        : [{ tabId: 501 }, { targetId: "page-1" }],
    );
    assert.equal(f.api.onDetach.listeners.size, 0);
  });
  test(`explicit ${route} attachment works when enumeration fails`, async () => {
    const f = lifecycleFixture();
    f.failures.discovery = true;
    const args = route === "target" ? { targetId: "page-1" } : { tabId: 501 };
    assert.equal(((await evaluate(args)) as any).result, "fixture result");
    assert.deepEqual(f.attaches, [args]);
    assert.equal(f.api.onDetach.listeners.size, 0);
  });
}

test("explicit target identity is honored even when its tab route is unusable", async () => {
  const f = lifecycleFixture();
  f.failures.routes.add("tab");
  await evaluate({ targetId: "page-1" });
  assert.deepEqual(f.attaches, [{ targetId: "page-1" }]);
});

test("conflicting explicit selectors cannot redirect effects to another page", async () => {
  const f = lifecycleFixture([
    { id: "page-1", tabId: 501 },
    { id: "page-2", tabId: 502 },
  ]);
  await assert.rejects(
    evaluate({ targetId: "page-1", tabId: 502 }),
    /different pages/,
  );
  assert.deepEqual(f.attaches, []);
  assert.deepEqual(f.calls, []);
});

test("automatic fallback never adopts a page attached by another debugger", async () => {
  const f = lifecycleFixture([{ id: "target-only", tabId: undefined }]);
  f.states[0].attached = true;
  await assert.rejects(evaluate({}), /NO_ACTIVE_WEB_TAB_FOUND/);
  assert.deepEqual(f.attaches, []);
});

test("failed reset reports unconfirmed cleanup, keeps ownership, and can retry", async () => {
  const f = lifecycleFixture();
  await emulate({ targetId: "page-1", viewport: "390x844" });
  f.failures.detach = true;
  for (const args of [{ tabId: 501 }, { targetId: "page-1" }]) {
    await assert.rejects(
      emulate({ ...args, reset: true }),
      /cleanup is unconfirmed/,
    );
    assert.equal(f.states[0].attached, true);
    assert.equal(f.states[0].emulated, true);
    assert.equal(f.attaches.length, 1);
    assert.equal(f.api.onDetach.listeners.size, 1);
  }
  f.failures.detach = false;
  assert.deepEqual(await emulate({ tabId: 501, reset: true }), {
    success: true,
    reset: true,
  });
  assert.equal(f.states[0].attached, false);
  assert.equal(f.states[0].emulated, false);
  assert.equal(f.attaches.length, 1);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("unconfirmed cleanup blocks subsequent page effects until detach succeeds", async () => {
  const f = lifecycleFixture();
  f.failures.detach = true;
  await assert.rejects(evaluate({ tabId: 501 }), /cleanup is unconfirmed/);
  const commands = f.calls.length;
  await assert.rejects(
    executeCdpTool("cdpInput", { targetId: "page-1", operation: "click" }),
    /cleanup is unconfirmed/,
  );
  assert.equal(f.calls.length, commands);
  assert.equal(f.attaches.length, 1);
  f.failures.detach = false;
  await evaluate({ targetId: "page-1" });
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("invalid emulation does not silently discard an existing retained session", async () => {
  const f = lifecycleFixture();
  await emulate({ tabId: 501, viewport: "390x844" });
  const commands = f.calls.length;
  await assert.rejects(
    emulate({ tabId: 501, viewport: "invalid" }),
    /Invalid viewport/,
  );
  assert.equal(f.calls.length, commands);
  assert.equal(f.states[0].emulated, true);
  assert.equal(f.detaches.length, 0);
  await emulate({ tabId: 501, reset: true });
});

for (const first of ["target", "tab"] as const) {
  test(`aliases share retained ownership without enumeration (${first} first)`, async () => {
    const f = lifecycleFixture();
    f.failures.discovery = true;
    await emulate({
      ...(first === "target" ? { targetId: "page-1" } : { tabId: 501 }),
      viewport: "390x844",
    });
    await evaluate(
      first === "target" ? { tabId: 501 } : { targetId: "page-1" },
    );
    assert.equal(f.attaches.length, 1);
    assert.equal(f.detaches.length, 0);
    await emulate({ targetId: "page-1", reset: true });
    assert.equal(f.api.onDetach.listeners.size, 0);
  });
}

test("tab/target alias calls queue behind the same active operation even if discovery fails", async () => {
  const f = lifecycleFixture();
  f.failures.discovery = true;
  const entered = deferred();
  const release = deferred<any>();
  const send = f.api.sendCommand;
  mock.method(f.api, "sendCommand", async (target, method, params) => {
    if (method === "Runtime.evaluate") {
      entered.resolve();
      return release.promise;
    }
    return send(target, method, params);
  });
  const first = evaluate({ tabId: 501 });
  await entered.promise;
  const controller = new AbortController();
  const second = executeCdpTool(
    "cdpInput",
    { targetId: "page-1", operation: "click" },
    controller.signal,
  );
  await setImmediate();
  assert.equal(f.attaches.length, 1);
  controller.abort();
  await assert.rejects(second, { name: "AbortError" });
  release.resolve({ result: { value: 1 } });
  await first;
  await setImmediate();
  assert.equal(
    f.calls.filter((call) => call.method.startsWith("Input.")).length,
    0,
  );
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("a busy page does not block execution on another page", async () => {
  const f = lifecycleFixture([
    { id: "page-1", tabId: 501 },
    { id: "page-2", tabId: 502 },
  ]);
  const entered = deferred();
  const release = deferred<any>();
  const send = f.api.sendCommand;
  mock.method(f.api, "sendCommand", async (target, method, params) => {
    if (target.tabId === 501) {
      entered.resolve();
      return release.promise;
    }
    return send(target, method, params);
  });
  const first = evaluate({ tabId: 501 });
  await entered.promise;
  const queued = evaluate({ targetId: "page-1" });
  await setImmediate();
  await evaluate({ tabId: 502 });
  release.resolve({ result: { value: 1 } });
  await Promise.all([first, queued]);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("abort during attach retains late failed cleanup for retry and sends no page commands", async () => {
  const f = lifecycleFixture();
  const entered = deferred();
  const release = deferred();
  const attach = f.api.attach;
  mock.method(f.api, "attach", async (target) => {
    entered.resolve();
    await release.promise;
    await attach(target);
  });
  f.failures.detach = true;
  const controller = new AbortController();
  const running = evaluate({ targetId: "page-1" }, controller.signal);
  await entered.promise;
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  release.resolve();
  await setImmediate();
  assert.deepEqual(f.calls, []);
  assert.equal(f.states[0].attached, true);
  await assert.rejects(evaluate({ tabId: 501 }), /cleanup is unconfirmed/);
  assert.equal(f.attaches.length, 1);
  f.failures.detach = false;
  await emulate({ targetId: "page-1", reset: true });
  assert.equal(f.states[0].attached, false);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("abort on a failed attachment does not try the alternate route", async () => {
  const f = lifecycleFixture();
  const controller = new AbortController();
  mock.method(f.api, "attach", async (target) => {
    f.attaches.push(target);
    controller.abort();
    throw new Error("Attach failed");
  });
  await assert.rejects(evaluate({ tabId: 501 }, controller.signal), {
    name: "AbortError",
  });
  await setImmediate();
  assert.deepEqual(f.attaches, [{ tabId: 501 }]);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("a matching detach event confirms cleanup even when detach rejects", async () => {
  const f = lifecycleFixture();
  await emulate({ targetId: "page-1", viewport: "390x844" });
  mock.method(f.api, "detach", async () => {
    f.drop({ tabId: 501 });
    throw new Error("Already detached");
  });
  assert.deepEqual(await emulate({ tabId: 501, reset: true }), {
    success: true,
    reset: true,
  });
  assert.equal(f.states[0].attached, false);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("unrelated detach events leave retained ownership intact; alias detach releases it", async () => {
  const f = lifecycleFixture();
  await emulate({ tabId: 501, viewport: "390x844" });
  f.api.onDetach.emit({ targetId: "unrelated" });
  await evaluate({ targetId: "page-1" });
  assert.equal(f.attaches.length, 1);
  f.drop({ targetId: "page-1" });
  assert.equal(f.api.onDetach.listeners.size, 0);
  await evaluate({ tabId: 501 });
  assert.equal(f.attaches.length, 2);
  assert.equal(f.api.onDetach.listeners.size, 0);
});

test("detach during attach is not overwritten by a late attach resolution", async () => {
  const f = lifecycleFixture();
  mock.method(f.api, "attach", async (target) => {
    f.attaches.push(target);
    f.drop({ tabId: 501 });
  });
  await assert.rejects(evaluate({ targetId: "page-1" }), /session detached/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.api.onDetach.listeners.size, 0);
});
