import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import * as backend from "../src/shared/sync-backends-impl";
import * as codec from "../src/shared/sync-tinybase-doc";
import { chatHistory, installBrowser } from "./helpers";

const revision = process.argv[2];
const { createSyncBackend, writeTinyBaseSyncValue } = revision
  ? await (await import("./load-sync-baseline")).loadSyncBaseline(revision)
  : { ...backend, ...codec };
const { local } = installBrowser();
const value = chatHistory(200);
const url = "https://sync.example/benchmark/";
const document = await writeTinyBaseSyncValue(
  `webdav::${url}:chats`,
  value,
  undefined,
);
globalThis.fetch = async () => new Response(document.bytes);
const syncBackend = createSyncBackend({
  id: "bench",
  type: "webdav",
  name: "Benchmark",
  url,
});
await syncBackend.read("chats");
local.writes.length = 0;
const samples: number[] = [];
for (let index = 0; index < 10; index++) {
  const start = performance.now();
  const result = await syncBackend.read("chats");
  samples.push(performance.now() - start);
  assert.deepEqual(result, value);
}
samples.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      workload:
        "10 unchanged WebDAV 200 reads (no validators); 200 chats x 20 messages; structured-cloned mock storage",
      node: process.version,
      revision: revision || "working tree",
      documentBytes: document.bytes.length,
      medianMs: samples[5],
      minMs: samples[0],
      maxMs: samples[9],
      localWrites: local.writes.length,
      localBytesWritten: local.writes.reduce(
        (sum, write) => sum + write.bytes,
        0,
      ),
    },
    null,
    2,
  ),
);
