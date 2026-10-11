import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  decodeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  writeTinyBaseSyncValue,
} from "../src/shared/sync-tinybase-doc";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { browserStorage, installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

const collections = [
  { key: "provider", seed: { only: { id: "only", models: [] } }, empty: {} },
  { key: "agents", seed: [{ id: "only", name: "Only" }], empty: [] },
  {
    key: "chats",
    seed: [{ id: "only", messages: [{ id: "message", content: "Hello" }] }],
    empty: [],
  },
];

test("same-millisecond edits from separate replicas converge", async () => {
  const a = browserStorage();
  const b = browserStorage();
  mock.method(Date, "now", () => 1_800_000_000_000);
  installBrowser(a);
  const left = await writeTinyBaseSyncValue("shared:language", "en", undefined);
  installBrowser(b);
  const right = await writeTinyBaseSyncValue(
    "shared:language",
    "fr",
    undefined,
  );
  const bValue = await readTinyBaseSyncValue("shared:language", left.bytes);
  installBrowser(a);
  const aValue = await readTinyBaseSyncValue("shared:language", right.bytes);
  assert.equal(aValue, bValue);
});

test("a fresh device's edit wins over an older remote edit from a fast clock", async () => {
  installBrowser();
  const realNow = Date.now();
  mock.method(Date, "now", () => realNow + 60_000);
  const remote = await writeTinyBaseSyncValue("fast:language", "fr", undefined);
  const providers = await writeTinyBaseSyncValue(
    "fast:provider",
    { a: { id: "a" } },
    undefined,
  );
  mock.restoreAll();
  installBrowser(browserStorage());
  const edit = await writeTinyBaseSyncValue(
    "fresh:language",
    "de",
    remote.bytes,
  );
  assert.equal(edit.value, "de");
  // Remote rows this device never saw are kept.
  const added = await writeTinyBaseSyncValue(
    "fresh:provider",
    { b: { id: "b" } },
    providers.bytes,
  );
  assert.deepEqual(Object.keys(added.value).sort(), ["a", "b"]);
});

test("WebDAV retries a competing write without losing either device's changes", async () => {
  const { local } = installBrowser();
  const config = {
    id: "race",
    type: "webdav" as const,
    name: "WebDAV",
    url: "https://sync.example/race/",
  };
  const key = "preferences";
  const scope = `webdav::${config.url}:${key}`;
  const initial = await writeTinyBaseSyncValue(
    scope,
    { left: 0, right: 0 },
    undefined,
  );
  const otherDevice = browserStorage();
  installBrowser(otherDevice);
  await readTinyBaseSyncValue(scope, initial.bytes);
  const competitor = await writeTinyBaseSyncValue(
    scope,
    { left: 0, right: 2 },
    initial.bytes,
  );
  installBrowser(local);
  let remote = initial.bytes;
  let version = 1;
  let puts = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    const headers = new Headers(init?.headers);
    if (init?.method === "PUT") {
      puts++;
      if (puts === 1) {
        remote = competitor.bytes;
        version++;
      }
      if (
        headers.get("If-Match") &&
        headers.get("If-Match") !== `"v${version}"`
      )
        return new Response(null, { status: 412 });
      remote = new Uint8Array(init.body as ArrayBuffer);
      version++;
      return new Response(null, {
        status: 204,
        headers: { ETag: `"v${version}"` },
      });
    }
    return new Response(remote, { headers: { ETag: `"v${version}"` } });
  });
  await createSyncBackend(config).write(key, { left: 1, right: 0 });
  assert.deepEqual(decodeTinyBaseSyncValue(scope, remote), {
    left: 1,
    right: 2,
  });
  assert.equal(puts, 2);
});

for (const { key, seed, empty } of collections) {
  test(`${key}: deleting the final item survives encoding, stale merge and fresh replica`, async () => {
    installBrowser();
    const before = await writeTinyBaseSyncValue(key, seed, undefined);
    const deleted = await writeTinyBaseSyncValue(key, empty, before.bytes);
    assert.deepEqual(deleted.value, empty);
    assert.deepEqual(decodeTinyBaseSyncValue(key, deleted.bytes), empty);
    assert.deepEqual(await readTinyBaseSyncValue(key, before.bytes), empty);
    installBrowser();
    assert.deepEqual(await readTinyBaseSyncValue(key, deleted.bytes), empty);
    assert.deepEqual(await readTinyBaseSyncValue(key, before.bytes), empty);
    assert.deepEqual(
      (await writeTinyBaseSyncValue(key, seed, deleted.bytes)).value,
      seed,
      "an explicit later addition must still work",
    );
  });
}

test("empty record entries remain present when all their fields are deleted", async () => {
  installBrowser();
  const key = "preferences";
  const seed = await writeTinyBaseSyncValue(
    key,
    { nested: { enabled: true } },
    undefined,
  );
  const next = { nested: {} };
  const result = await writeTinyBaseSyncValue(key, next, seed.bytes);
  assert.deepEqual(result.value, next);
  installBrowser();
  assert.deepEqual(await readTinyBaseSyncValue(key, result.bytes), next);
});

test("deleting final nested chat items preserves the chat and its other fields", async () => {
  installBrowser();
  const key = "chats";
  const seed = await writeTinyBaseSyncValue(
    key,
    [
      {
        id: "chat",
        title: "Keep",
        messages: [{ id: "message", content: "Hello" }],
        sources: [{ id: "source", title: "Reference" }],
        imageGenerationJobs: [{ id: "job", status: "complete" }],
      },
    ],
    undefined,
  );
  const next = [{ id: "chat", title: "Keep", messages: [] }];
  const result = await writeTinyBaseSyncValue(key, next, seed.bytes);
  assert.deepEqual(result.value, next);
  installBrowser();
  assert.deepEqual(await readTinyBaseSyncValue(key, result.bytes), next);
});

test("clearing known rows preserves an independently added remote row", async () => {
  const left = browserStorage();
  const right = browserStorage();
  const key = "browser-sync:provider";
  const original = { only: { id: "only", models: [] } };
  const addition = { later: { id: "later", models: [] } };
  installBrowser(left);
  const seed = await writeTinyBaseSyncValue(key, original, undefined);
  installBrowser(right);
  await readTinyBaseSyncValue(key, seed.bytes);
  const added = await writeTinyBaseSyncValue(
    key,
    { ...original, ...addition },
    seed.bytes,
  );
  installBrowser(left);
  const deleted = await writeTinyBaseSyncValue(key, {}, undefined);
  assert.deepEqual(await readTinyBaseSyncValue(key, added.bytes), addition);
  installBrowser(right);
  assert.deepEqual(await readTinyBaseSyncValue(key, deleted.bytes), addition);
});

test("WebDAV retry of a final-provider deletion preserves a competing provider addition", async () => {
  const { local } = installBrowser();
  const config = {
    id: "empty-race",
    type: "webdav" as const,
    name: "Fixture",
    url: "https://sync.example/empty-race/",
  };
  const scope = `webdav::${config.url}:provider`;
  const original = { only: { id: "only", models: [] } };
  const addition = { later: { id: "later", models: [] } };
  const seed = await writeTinyBaseSyncValue(scope, original, undefined);
  installBrowser();
  await readTinyBaseSyncValue(scope, seed.bytes);
  const competitor = await writeTinyBaseSyncValue(
    scope,
    { ...original, ...addition },
    seed.bytes,
  );
  installBrowser(local);
  let remote = seed.bytes;
  let version = 1;
  let puts = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    if (init?.method === "PUT") {
      if (++puts === 1) {
        remote = competitor.bytes;
        version++;
      }
      if (new Headers(init.headers).get("If-Match") !== `"${version}"`)
        return new Response(null, { status: 412 });
      remote = new Uint8Array(init.body as ArrayBuffer);
      version++;
      return new Response(null, {
        status: 204,
        headers: { ETag: `"${version}"` },
      });
    }
    return new Response(remote, { headers: { ETag: `"${version}"` } });
  });
  assert.deepEqual(
    await createSyncBackend(config).write("provider", {}),
    addition,
  );
  assert.deepEqual(decodeTinyBaseSyncValue(scope, remote), addition);
  assert.equal(puts, 2);
});

for (const type of ["browser-sync", "webdav"] as const) {
  test(`${type}: empty writes remain documents; remove deletes the document and replica cache`, async () => {
    const { local, sync } = installBrowser();
    let remote: Uint8Array | undefined;
    let version = 0;
    mock.method(globalThis, "fetch", async (_url, init) => {
      const headers = new Headers(init?.headers);
      if (init?.method === "PUT") {
        assert.equal(
          headers.get(remote ? "If-Match" : "If-None-Match"),
          remote ? `"${version}"` : "*",
        );
        remote = new Uint8Array(init.body as ArrayBuffer);
        version++;
        return new Response(null, {
          status: 204,
          headers: { ETag: `"${version}"` },
        });
      }
      if (init?.method === "DELETE") {
        assert.equal(headers.get("If-Match"), null);
        remote = undefined;
        return new Response(null, { status: 204 });
      }
      if (!remote) return new Response(null, { status: 404 });
      return new Response(remote, { headers: { ETag: `"${version}"` } });
    });
    const config =
      type === "webdav"
        ? {
            id: "empty-webdav",
            name: "Fixture",
            type,
            url: "https://sync.example/empty/",
          }
        : { id: "browser-sync", name: "Fixture", type };
    const backend = createSyncBackend(config);
    await backend.write("provider", { only: { id: "only", models: [] } });
    assert.deepEqual(await backend.write("provider", {}), {});
    assert.ok(type === "webdav" ? remote : sync.data.provider);
    assert.deepEqual(await createSyncBackend(config).read("provider"), {});
    await backend.remove("provider");
    assert.equal(await backend.read("provider"), undefined);
    assert.equal(type === "webdav" ? remote : sync.data.provider, undefined);
    assert.deepEqual(local.data, {});
  });
}
