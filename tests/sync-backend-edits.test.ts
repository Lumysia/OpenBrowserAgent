import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SYNC_BACKENDS,
  webDavBackendOf,
  withWebDavPatch,
} from "../src/shared/sync-backends";
import { getMessages } from "../src/shared/i18n";
import { syncBackendTitle } from "../src/ui/sync-backend-display";

const t = getMessages("en-US");

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

test("a backend's title is its own name, else what kind it is", () => {
  const backends = withWebDavPatch(DEFAULT_SYNC_BACKENDS, {});
  assert.equal(
    syncBackendTitle(webDavBackendOf(backends), t),
    t.options.syncBackendWebDavSync,
  );
  assert.equal(
    syncBackendTitle(
      webDavBackendOf(withWebDavPatch(backends, { name: "Home NAS" })),
      t,
    ),
    "Home NAS",
  );
});
