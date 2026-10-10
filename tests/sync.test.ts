import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import {
  bytesToBase64,
  decodeTinyBaseSyncValue,
  readTinyBaseSyncValue,
  writeTinyBaseSyncValue,
} from "../src/shared/sync-tinybase-doc";
import { createSyncBackend } from "../src/shared/sync-backends-impl";
import { browserStorage, chatHistory, installBrowser } from "./helpers";

afterEach(() => mock.restoreAll());

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

test("unchanged browser sync reads preserve data without rewriting local storage", async () => {
  const { local, sync } = installBrowser();
  const key = "preferences";
  const value = { theme: "dark", nested: { enabled: true } };
  const document = await writeTinyBaseSyncValue(
    "browser:preferences",
    value,
    undefined,
  );
  sync.data[key] = bytesToBase64(document.bytes);
  const backend = createSyncBackend({
    id: "browser",
    type: "browser-sync",
    name: "Browser",
  });
  local.writes.length = 0;
  assert.deepEqual(await backend.read(key), value);
  assert.deepEqual(await backend.read(key), value);
  assert.equal(local.writes.length, 0);
});

test("WebDAV restart does not treat persisted validators without a body as cached data", async () => {
  const { local } = installBrowser();
  const config = {
    id: "restart",
    type: "webdav" as const,
    name: "WebDAV",
    url: "https://sync.example/restart/",
  };
  const scope = `webdav::${config.url}:language`;
  const document = await writeTinyBaseSyncValue(scope, "fr", undefined);
  local.data[`${scope}:webdav-read-cache`] = { etag: '"v1"' };
  mock.method(globalThis, "fetch", async (_url, init) => {
    if (new Headers(init?.headers).has("If-None-Match"))
      return new Response(null, { status: 304 });
    return new Response(document.bytes, { headers: { ETag: '"v1"' } });
  });
  assert.equal(await createSyncBackend(config).read("language"), "fr");
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
