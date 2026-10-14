import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserSyncTransport } from "../src/shared/sync/browser-sync";
import { sha256Hex } from "../src/shared/sync/codec";
import { formatClock } from "../src/shared/sync/hlc";
import { emptyRoot } from "../src/shared/sync/root";
import { createWebDavTransport } from "../src/shared/sync/webdav";
import { memoryArea } from "./fake-chrome";

// What the transports do on bad days: a server that never answers, devices
// whose clocks are a day off.

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// A fetch that never answers, unless the request is aborted.
const silentServer = (async (_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(init.signal!.reason ?? new Error("aborted")),
    );
  })) as typeof fetch;

test("WebDAV requests to a server that never answers time out", async () => {
  const transport = createWebDavTransport(
    { url: "https://dav.test/x/" },
    silentServer,
    { timeoutMs: 50 },
  );
  const outcome = (promise: Promise<unknown>) =>
    Promise.race([
      promise.then(
        () => "answered",
        (error: Error) => error.name,
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 2000)),
    ]);
  assert.equal(await outcome(transport.readRoot()), "TimeoutError");
  assert.equal(
    await outcome(transport.putBlob("0".repeat(64), new Uint8Array(10))),
    "TimeoutError",
  );
});

async function blob(text: string) {
  const payload = new TextEncoder().encode(text);
  return { payload, hash: await sha256Hex(payload) };
}

const rootWithTheme = () => {
  const root = emptyRoot("a");
  root.records["preferences/theme"] = {
    clock: formatClock(1, 0, "a"),
    data: "dark",
  };
  return root;
};

test("browser sync: a device whose clock runs a day ahead keeps another device's parts", async () => {
  const area = memoryArea();
  const time = { now: 1_000_000_000 };
  const writer = createBrowserSyncTransport(area, () => time.now);
  const ahead = createBrowserSyncTransport(area, () => time.now + DAY);
  // The writer's parts have arrived; its record is still on its way.
  const { payload, hash } = await blob("skill files in flight");
  await writer.putBlob(hash, payload);
  await ahead.writeRoot(rootWithTheme(), undefined);
  assert.ok(`p:${hash}` in area.data, "kept");
  assert.deepEqual(await writer.getBlob(hash), payload);
  // Nobody referred to them for a day by that device's own clock: gone.
  time.now += 25 * HOUR;
  await ahead.writeRoot(rootWithTheme(), undefined);
  assert.ok(!(`p:${hash}` in area.data), "removed a day later");
});

test("browser sync: parts written by a device whose clock runs a day behind are kept", async () => {
  const area = memoryArea();
  const time = { now: 1_000_000_000 };
  const behind = createBrowserSyncTransport(area, () => time.now - DAY);
  const reader = createBrowserSyncTransport(area, () => time.now);
  const { payload, hash } = await blob("agent files in flight");
  await behind.putBlob(hash, payload);
  await reader.writeRoot(rootWithTheme(), undefined);
  assert.ok(`p:${hash}` in area.data);
});
