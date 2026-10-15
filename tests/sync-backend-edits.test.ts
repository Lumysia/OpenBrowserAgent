import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SYNC_BACKENDS,
  webDavBackendOf,
  withWebDavPatch,
} from "../src/shared/sync-backends";

test("WebDAV edits are trimmed and keep the other backends", () => {
  const next = withWebDavPatch(DEFAULT_SYNC_BACKENDS, {
    url: " https://dav.test/ ",
    username: "  ",
    password: "p",
  });
  assert.deepEqual(next[0], DEFAULT_SYNC_BACKENDS[0]);
  assert.deepEqual(webDavBackendOf(next), {
    id: "webdav",
    type: "webdav",
    name: "WebDAV",
    url: "https://dav.test/",
    username: undefined,
    password: "p",
  });
  assert.equal(
    webDavBackendOf(withWebDavPatch(next, { name: " " })).name,
    "WebDAV",
  );
});
