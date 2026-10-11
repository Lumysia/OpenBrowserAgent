import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  base64ToBytes,
  decodeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  writeTinyBaseSyncValue,
} from "../src/shared/sync-tinybase-doc";
import { tinybaseSyncLocalCacheKey } from "../src/shared/sync-tinybase-doc";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { browserStorage, installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

test("new deletion markers survive JSON without converting legitimate nulls to deletions", async () => {
  installBrowser();
  const key = "deletions:agents";
  await writeTinyBaseSyncValue(
    key,
    [
      { id: "keep", nullable: null, text: "undefined" },
      { id: "delete", name: "old" },
    ],
    undefined,
  );
  const next = [{ id: "keep", nullable: null, text: "undefined" }];
  const deleted = await writeTinyBaseSyncValue(key, next, undefined);
  assert.deepEqual(decodeTinyBaseSyncValue(key, deleted.bytes), next);
  assert.equal(
    new TextDecoder().decode(deleted.bytes).includes('"delete"'),
    true,
  );
  const { local } = installBrowser();
  assert.deepEqual(await readTinyBaseSyncValue(key, deleted.bytes), next);
  assert.ok(local.data[tinybaseSyncLocalCacheKey(key)]);
});

test("independent row additions, edits and deletions merge across devices", async () => {
  const left = browserStorage();
  const right = browserStorage();
  const key = "two-devices:agents";
  installBrowser(left);
  const seed = await writeTinyBaseSyncValue(
    key,
    [
      { id: "keep", name: "before" },
      { id: "delete", name: "old" },
    ],
    undefined,
  );
  installBrowser(right);
  await readTinyBaseSyncValue(key, seed.bytes);
  const remote = await writeTinyBaseSyncValue(
    key,
    [
      { id: "keep", name: "remote edit" },
      { id: "delete", name: "old" },
      { id: "new", name: "added" },
    ],
    seed.bytes,
  );
  installBrowser(left);
  const local = await writeTinyBaseSyncValue(
    key,
    [{ id: "keep", name: "before" }],
    undefined,
  );
  const mergedLeft = await readTinyBaseSyncValue<
    Array<{ id: string; name: string }>
  >(key, remote.bytes);
  installBrowser(right);
  const mergedRight = await readTinyBaseSyncValue(key, local.bytes);
  assert.deepEqual(mergedLeft, mergedRight);
  assert.deepEqual(
    new Map(mergedLeft?.map((row) => [row.id, row.name])),
    new Map([
      ["keep", "remote edit"],
      ["new", "added"],
    ]),
  );
});

test("malformed remote data cannot replace a valid local document", async () => {
  const { local } = installBrowser();
  const key = "safe:language";
  await writeTinyBaseSyncValue(key, "en", undefined);
  const before = structuredClone(local.data);
  await assert.rejects(
    readTinyBaseSyncValue(key, new TextEncoder().encode("not a sync document")),
    /Invalid TinyBase/,
  );
  assert.deepEqual(local.data, before);
  for (const content of [
    undefined,
    {},
    [[{}, "", 0]],
    [
      [{ items: [null, "", 0] }, "", 0],
      [{}, "", 0],
    ],
  ]) {
    const bytes = new TextEncoder().encode(
      `OpenBrowserAgentTinyBaseSync:${JSON.stringify({ format: "openbrowseragent.tinybase-sync.v2", content })}`,
    );
    await assert.rejects(
      readTinyBaseSyncValue(key, bytes),
      /Invalid TinyBase sync content/,
    );
    assert.deepEqual(local.data, before);
  }
});

test("browser sync quota failure retains local changes and leaves remote data intact", async () => {
  const { local, sync } = installBrowser();
  const backend = createSyncBackend({
    id: "quota",
    type: "browser-sync",
    name: "Browser",
  });
  await backend.write("language", "en");
  const before = structuredClone(sync.data);
  await assert.rejects(
    backend.write("language", "x".repeat(10_000)),
    /per-item limit/,
  );
  assert.deepEqual(sync.data, before);
  const bytes = base64ToBytes(
    local.data[tinybaseSyncLocalCacheKey("quota:language")] as string,
  );
  assert.equal(
    decodeTinyBaseSyncValue("quota:language", bytes),
    "x".repeat(10_000),
  );
});
