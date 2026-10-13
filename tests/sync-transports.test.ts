import assert from "node:assert/strict";
import test from "node:test";
import { createWebDavTransport } from "../src/shared/sync/webdav";

// What the transports do on bad days.

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
        () => "failed",
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 2000)),
    ]);
  assert.equal(await outcome(transport.readRoot()), "failed");
  assert.equal(
    await outcome(transport.putBlob("0".repeat(64), new Uint8Array(10))),
    "failed",
  );
});
