import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import {
  decodeTinyBaseSyncValue,
  writeTinyBaseSyncValue,
} from "../src/shared/sync-tinybase-doc";
import { browserStorage, installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

function config(id: string) {
  return {
    id,
    type: "webdav" as const,
    name: "WebDAV",
    url: `https://sync.example/${id}/`,
  };
}

test("warm 304 uses its own value, avoids storage work and isolates caller mutations", async () => {
  const { local } = installBrowser();
  const settings = config("warm");
  const seed = await writeTinyBaseSyncValue(
    `webdav::${settings.url}:preferences`,
    { theme: "dark" },
    undefined,
  );
  let requests = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests++;
    return new Headers(init?.headers).has("If-None-Match")
      ? new Response(null, { status: 304 })
      : new Response(seed.bytes, { headers: { ETag: '"v1"' } });
  });
  const backend = createSyncBackend(settings);
  const value = await backend.read<{ theme: string }>("preferences");
  value!.theme = "changed by caller";
  const get = mock.method(local.area, "get");
  assert.deepEqual(
    await backend.read("preferences", { theme: "stale caller" }),
    { theme: "dark" },
  );
  assert.equal(get.mock.callCount(), 0);
  assert.equal(requests, 2);
});

test("failed PUT followed by a 304 cannot associate remote validators with unaccepted local bytes", async () => {
  installBrowser();
  const settings = config("failed-put");
  const scope = `webdav::${settings.url}:preferences`;
  const remoteSeed = await writeTinyBaseSyncValue(
    scope,
    { remoteOnly: 7 },
    undefined,
  );
  // Fresh local replica has never loaded the existing remote field.
  installBrowser(browserStorage());
  let puts = 0;
  const conditions: string[] = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    const headers = new Headers(init?.headers);
    if (init?.method === "PUT") {
      puts++;
      conditions.push(headers.get("If-Match") || "");
      if (puts === 1) return new Response(null, { status: 503 });
      assert.deepEqual(
        decodeTinyBaseSyncValue(
          scope,
          new Uint8Array(init.body as ArrayBuffer),
        ),
        { remoteOnly: 7, localOnly: 1 },
      );
      return new Response(null, { status: 204, headers: { ETag: '"v2"' } });
    }
    return headers.has("If-None-Match")
      ? new Response(null, { status: 304 })
      : new Response(remoteSeed.bytes, { headers: { ETag: '"v1"' } });
  });
  const backend = createSyncBackend(settings);
  await assert.rejects(backend.write("preferences", { localOnly: 1 }), /503/);
  assert.deepEqual(await backend.read("preferences"), {
    remoteOnly: 7,
    localOnly: 1,
  });
  assert.deepEqual(
    await backend.write("preferences", { remoteOnly: 7, localOnly: 1 }),
    { remoteOnly: 7, localOnly: 1 },
  );
  assert.deepEqual(conditions, ['"v1"', '"v1"']);
});

test("simultaneous document creation uses If-None-Match and merges the winner", async () => {
  installBrowser();
  const settings = config("creation-race");
  const scope = `webdav::${settings.url}:preferences`;
  const competitor = await writeTinyBaseSyncValue(
    "other:preferences",
    { remote: true },
    undefined,
  );
  let remote: Uint8Array | undefined;
  let puts = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    const headers = new Headers(init?.headers);
    if (init?.method === "PUT") {
      puts++;
      if (puts === 1) {
        assert.equal(headers.get("If-None-Match"), "*");
        remote = competitor.bytes;
        return new Response(null, { status: 412 });
      }
      assert.equal(headers.get("If-Match"), '"winner"');
      remote = new Uint8Array(init.body as ArrayBuffer);
      return new Response(null, { status: 204, headers: { ETag: '"merged"' } });
    }
    return remote
      ? new Response(remote, { headers: { ETag: '"winner"' } })
      : new Response(null, { status: 404 });
  });
  await createSyncBackend(settings).write("preferences", { local: true });
  assert.deepEqual(decodeTinyBaseSyncValue(scope, remote!), {
    local: true,
    remote: true,
  });
});

test("persistent conflicts are bounded and a later operation still runs", async () => {
  installBrowser();
  mock.method(Date, "now", () => 1_800_000_000_000);
  const settings = config("bounded");
  const remote = await writeTinyBaseSyncValue("bounded-seed", "en", undefined);
  let puts = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    if (init?.method === "PUT") {
      puts++;
      assert.equal(
        decodeTinyBaseSyncValue(
          "language",
          new Uint8Array(init.body as ArrayBuffer),
        ),
        "fr",
      );
      return new Response(null, { status: 412 });
    }
    return new Response(remote.bytes, { headers: { ETag: '"v1"' } });
  });
  const backend = createSyncBackend(settings);
  // Establish the state being edited. Without this read, the two initial values
  // are concurrent and either replica may win the same-millisecond HLC tie.
  // Keep time frozen so retaining the edit depends on causality, not elapsed time.
  assert.equal(await backend.read("language"), "en");
  await assert.rejects(backend.write("language", "fr"), /412/);
  assert.equal(puts, 3);
  assert.equal(await backend.read("language"), "fr");
});

test("overlapping adapters serialize operations for the same document", async () => {
  installBrowser();
  const settings = config("serial");
  const remote = await writeTinyBaseSyncValue("serial-seed", "en", undefined);
  let finishPut!: () => void;
  const blockedPut = new Promise<void>((resolve) => {
    finishPut = resolve;
  });
  let started!: () => void;
  const putStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let languageGets = 0;
  mock.method(globalThis, "fetch", async (url, init) => {
    if (init?.method === "PUT") {
      started();
      await blockedPut;
      return new Response(null, { status: 204, headers: { ETag: '"v2"' } });
    }
    if (String(url).includes("language")) languageGets++;
    return new Response(remote.bytes, { headers: { ETag: '"v1"' } });
  });
  const write = createSyncBackend(settings).write("language", "fr");
  await putStarted;
  const read = createSyncBackend(settings).read("language");
  await createSyncBackend(settings).read("another-key");
  assert.equal(languageGets, 1);
  finishPut();
  await Promise.all([write, read]);
  assert.equal(languageGets, 2);
});

test("servers without write validators fail explicitly without issuing an unsafe PUT", async () => {
  installBrowser();
  const remote = await writeTinyBaseSyncValue(
    "unconditional-seed",
    "en",
    undefined,
  );
  let puts = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    if (init?.method === "PUT") puts++;
    return new Response(remote.bytes);
  });
  await assert.rejects(
    createSyncBackend(config("no-validators")).write("language", "fr"),
    /strong ETag or Last-Modified/,
  );
  assert.equal(puts, 0);
});
