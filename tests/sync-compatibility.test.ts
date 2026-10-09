import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createMergeableStore } from "tinybase";
import {
  base64ToBytes,
  bytesToBase64,
  decodeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  writeTinyBaseSyncValue,
} from "../src/shared/sync-tinybase-doc";
import { tinybaseSyncLocalCacheKey } from "../src/shared/sync-tinybase-keys";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { browserStorage, chatHistory, installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

test("v1 history with nested tools, media and metadata survives round trips", async () => {
  const { local } = installBrowser();
  const key = "existing-backend:chats";
  const history = chatHistory(2, 2);
  Object.assign(history[0].messages[1], {
    parts: [
      {
        id: "tool",
        type: "tool-screenshot",
        input: { tabId: 4 },
        output: { media: [{ dataUrl: "data:image/png;base64,eA==" }] },
      },
    ],
    metadata: {
      uploadedAttachments: [
        {
          id: "file",
          syncAttachment: { objectName: "attachments/sha256.png" },
        },
      ],
    },
  });
  Object.assign(history[0], {
    imageGenerationJobs: [{ id: "job", status: "complete" }],
    childChatIds: ["child"],
  });
  // Construct the exact legacy envelope and array schema, including the old
  // shared replica ID. New code must read it without restamping its contents.
  const legacy = createMergeableStore(key, () => 1_700_000_000_000);
  legacy.setTables({
    items: Object.fromEntries(
      history.map((chat, index) => [
        chat.id,
        { ...chat, __openBrowserAgentSyncOrder: index },
      ]),
    ),
  });
  legacy.setValues({ kind: "array" });
  const bytes = new TextEncoder().encode(
    `OpenBrowserAgentTinyBaseSync:${JSON.stringify({ format: "openbrowseragent.tinybase-sync.v1", content: legacy.getMergeableContent() })}`,
  );
  assert.deepEqual(await readTinyBaseSyncValue(key, bytes), history);
  const cachedBytes = local.data[tinybaseSyncLocalCacheKey(key)];
  assert.equal(cachedBytes, bytesToBase64(bytes));
  local.writes.length = 0;
  assert.deepEqual(await readTinyBaseSyncValue(key, bytes), history);
  assert.equal(local.writes.length, 0);
  const written = await writeTinyBaseSyncValue(key, history, bytes);
  assert.deepEqual(decodeTinyBaseSyncValue(key, written.bytes), history);
});

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

test("legacy null values remain null because old tombstones cannot be distinguished", () => {
  const legacy = createMergeableStore("legacy-null")
    .setCell("items", "row", "nullable", null)
    .setValues({ kind: "array" });
  const bytes = new TextEncoder().encode(
    `OpenBrowserAgentTinyBaseSync:${JSON.stringify({ format: "openbrowseragent.tinybase-sync.v1", content: legacy.getMergeableContent() })}`,
  );
  assert.deepEqual(decodeTinyBaseSyncValue("legacy-null", bytes), [
    { id: "row", nullable: null },
  ]);
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
      `OpenBrowserAgentTinyBaseSync:${JSON.stringify({ format: "openbrowseragent.tinybase-sync.v1", content })}`,
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
