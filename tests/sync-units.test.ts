import assert from "node:assert/strict";
import test from "node:test";
import { pauseDuration } from "../src/background/sync/service";
import {
  BROWSER_SYNC_LIMITS,
  createBrowserSyncTransport,
  SyncNotReadyError,
  SyncQuotaError,
} from "../src/shared/sync/browser-sync";
import { hashJson } from "../src/shared/sync/codec";
import {
  compareClocks,
  formatClock,
  INITIAL_HLC,
  observeClock,
  tickClock,
} from "../src/shared/sync/hlc";
import { mergeChatBodies, mergeFiles } from "../src/shared/sync/merge-content";
import { decide } from "../src/shared/sync/plan";
import {
  decodeRoot,
  emptyRoot,
  encodeRoot,
  SyncFormatError,
  validateRoot,
} from "../src/shared/sync/root";
import { parseRetryAfter } from "../src/shared/sync/transport";
import { parseMultistatus, strongEtag } from "../src/shared/sync/webdav";
import { memoryArea } from "./sync-fixtures";

test("HLC clocks order by wall time, then counter, then device", () => {
  const [first, state] = tickClock(INITIAL_HLC, "a", 1000);
  const [second, state2] = tickClock(state, "a", 1000);
  // The wall clock went backwards: the clock still moves forward.
  const [third] = tickClock(state2, "a", 500);
  assert.ok(compareClocks(first, second) < 0);
  assert.ok(compareClocks(second, third) < 0);
  assert.ok(
    compareClocks(formatClock(1000, 0, "a"), formatClock(1000, 0, "b")) < 0,
  );
  assert.ok(
    compareClocks(formatClock(999, 99, "z"), formatClock(1000, 0, "a")) < 0,
  );
  // A clock seen from a device that ran ahead pushes later local clocks past it.
  const ahead = formatClock(5000, 3, "b");
  const [after] = tickClock(observeClock(state2, ahead), "a", 1001);
  assert.ok(compareClocks(after, ahead) > 0);
});

const clock = (wall: number, device = "a") => formatClock(wall, 0, device);

test("record merge: newer clock wins, untouched fields follow the other side", async () => {
  const base = {
    clock: clock(1),
    dataHash: await hashJson({ v: 1 }),
    blob: undefined,
  };
  // Only the remote changed: apply.
  assert.deepEqual(
    await decide({
      synced: base,
      remote: { clock: clock(2, "b"), data: { v: 2 } },
      mergesContent: false,
      dataHash: hashJson,
    }),
    { kind: "apply", record: { clock: clock(2, "b"), data: { v: 2 } } },
  );
  // Only this device changed: push.
  const pending = { clock: clock(3), data: { v: 3 } };
  assert.equal(
    (
      await decide({
        synced: base,
        pending,
        remote: { clock: clock(1), data: { v: 1 } },
        mergesContent: false,
        dataHash: hashJson,
      })
    ).kind,
    "push",
  );
  // Both changed: the newer clock wins either way round.
  const remoteOlder = { clock: clock(2, "b"), data: { v: 2 } };
  assert.equal(
    (
      await decide({
        synced: base,
        pending,
        remote: remoteOlder,
        mergesContent: false,
        dataHash: hashJson,
      })
    ).kind,
    "push",
  );
  const remoteNewer = { clock: clock(4, "b"), data: { v: 4 } };
  assert.deepEqual(
    await decide({
      synced: base,
      pending,
      remote: remoteNewer,
      mergesContent: false,
      dataHash: hashJson,
    }),
    { kind: "apply", record: remoteNewer },
  );
  // The remote already holds this device's change.
  assert.equal(
    (
      await decide({
        synced: base,
        pending,
        remote: pending,
        mergesContent: false,
        dataHash: hashJson,
      })
    ).kind,
    "accept",
  );
});

test("tombstones: a delete wins only when newer than the edit", async () => {
  const base = { clock: clock(1), dataHash: await hashJson("x") };
  const edit = { clock: clock(5), data: "y" };
  const olderDelete = { clock: clock(3, "b"), deleted: true as const };
  const newerDelete = { clock: clock(7, "b"), deleted: true as const };
  assert.equal(
    (
      await decide({
        synced: base,
        pending: edit,
        remote: olderDelete,
        mergesContent: false,
        dataHash: hashJson,
      })
    ).kind,
    "push",
  );
  assert.equal(
    (
      await decide({
        synced: base,
        pending: edit,
        remote: newerDelete,
        mergesContent: false,
        dataHash: hashJson,
      })
    ).kind,
    "apply",
  );
  // A local delete against a newer remote edit loses.
  assert.equal(
    (
      await decide({
        synced: base,
        pending: { clock: clock(2), deleted: true },
        remote: { clock: clock(4, "b"), data: "z" },
        mergesContent: false,
        dataHash: hashJson,
      })
    ).kind,
    "apply",
  );
});

test("a missing or older remote record is uploaded again, never deleted", async () => {
  const synced = { clock: clock(5), dataHash: await hashJson("x") };
  const local = { clock: clock(5), data: "x" };
  assert.deepEqual(
    await decide({ synced, local, mergesContent: false, dataHash: hashJson }),
    { kind: "push", record: local },
  );
  assert.deepEqual(
    await decide({
      synced,
      local,
      remote: { clock: clock(2), data: "old" },
      mergesContent: false,
      dataHash: hashJson,
    }),
    { kind: "push", record: local },
  );
});

test("a device joining an account takes the account's values", async () => {
  const decision = await decide({
    pending: { clock: clock(9), data: "device default" },
    remote: { clock: clock(1, "b"), data: "account value" },
    mergesContent: false,
    dataHash: hashJson,
  });
  assert.equal(decision.kind, "apply");
});

test("chat message union keeps messages from both devices in time order", () => {
  const message = (id: string, createdAt: number, content = id) => ({
    id,
    createdAt,
    content,
  });
  const base = { messages: [message("m1", 1)] };
  const mine = {
    messages: [message("m1", 1), message("a2", 2), message("a4", 4)],
  };
  const theirs = { messages: [message("m1", 1), message("b3", 3)] };
  const merged = mergeChatBodies(base, mine, theirs, "mine");
  assert.deepEqual(
    merged.messages.map((entry) => entry.id),
    ["m1", "a2", "b3", "a4"],
  );
  // Same result whichever side merges.
  assert.deepEqual(
    mergeChatBodies(base, theirs, mine, "theirs").messages.map(
      (entry) => entry.id,
    ),
    ["m1", "a2", "b3", "a4"],
  );
  // A message deleted on one side and untouched on the other stays deleted;
  // edited on the other side, it stays.
  const deleted = mergeChatBodies(base, { messages: [] }, base, "mine");
  assert.deepEqual(deleted.messages, []);
  const kept = mergeChatBodies(
    base,
    { messages: [] },
    { messages: [message("m1", 1, "edited")] },
    "mine",
  );
  assert.equal(kept.messages[0].content, "edited");
  // Without a base nothing is dropped.
  assert.equal(
    mergeChatBodies(undefined, { messages: [] }, base, "mine").messages.length,
    1,
  );
});

test("files edited on two devices keep the newer and a conflict copy", () => {
  const file = (path: string, content: string) => ({ path, content });
  const base = [file("SKILL.md", "v1"), file("notes/a.txt", "a")];
  const mine = [file("SKILL.md", "mine"), file("notes/a.txt", "a")];
  const theirs = [
    file("SKILL.md", "theirs"),
    file("notes/a.txt", "a2"),
    file("new.md", "n"),
  ];
  const merged = mergeFiles(base, mine, theirs, "theirs", "dev1-2026-10-12");
  assert.deepEqual(merged, [
    file("SKILL.md", "theirs"),
    file("notes/a.txt", "a2"),
    file("new.md", "n"),
    file("SKILL.conflict-dev1-2026-10-12.md", "mine"),
  ]);
});

test("root validation rejects anything that is not a complete root", async () => {
  const good = emptyRoot("a");
  good.records["chats/x"] = { clock: clock(1), data: { id: "x" } };
  assert.deepEqual(await decodeRoot(await encodeRoot(good)), good);
  const bad: unknown[] = [
    null,
    { ...good, format: "something-else" },
    { ...good, records: { "chats/x": { clock: "nope", data: 1 } } },
    { ...good, records: { "chats/x": { clock: clock(1) } } },
    {
      ...good,
      records: { "chats/x": { clock: clock(1), deleted: true, data: 1 } },
    },
    { ...good, records: { "chats/x": { clock: clock(1), blob: "abc" } } },
    { ...good, records: { "../x": { clock: clock(1), data: 1 } } },
    { ...good, garbage: [{ blob: "x", since: 1 }] },
    { ...good, garbage: undefined },
  ];
  for (const value of bad)
    assert.throws(() => validateRoot(value), SyncFormatError);
  assert.throws(
    () => validateRoot({ ...good, format: "openbrowseragent.sync.v9" }),
    (error: SyncFormatError) => error.newerFormat,
  );
  await assert.rejects(
    decodeRoot(new TextEncoder().encode("{}")),
    SyncFormatError,
  );
});

test("backoff: 1 min doubling to 1 h, longer when Retry-After says so", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map((level) => pauseDuration(level) / 60_000),
    [1, 2, 4, 8, 16, 32, 60, 60],
  );
  assert.equal(pauseDuration(1, 300_000), 300_000);
  assert.equal(parseRetryAfter("120"), 120_000);
  assert.equal(parseRetryAfter("0"), 1_000);
  assert.equal(parseRetryAfter("999999"), 3_600_000);
  const now = Date.parse("2026-10-12T10:00:00Z");
  assert.equal(parseRetryAfter("Mon, 12 Oct 2026 10:05:00 GMT", now), 300_000);
  assert.equal(parseRetryAfter("soon"), undefined);
});

test("WebDAV helpers: strong ETags only, listings by name", () => {
  assert.equal(strongEtag('"abc"'), '"abc"');
  assert.equal(strongEtag('W/"abc"'), undefined);
  assert.equal(strongEtag("abc"), undefined);
  const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
    <d:response><d:href>/dav/x/blobs/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
    <d:response><d:href>/dav/x/blobs/a/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getlastmodified>Mon, 12 Oct 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
    <d:response><d:href>/dav/x/blobs/f.gz</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>
  </d:multistatus>`;
  assert.deepEqual(parseMultistatus(xml, "http://h/dav/x/blobs/"), [
    {
      path: "a",
      folder: true,
      modifiedAt: Date.parse("Mon, 12 Oct 2026 10:00:00 GMT"),
    },
    { path: "f.gz", folder: false, modifiedAt: undefined },
  ]);
});

test("browser sync: records split into items under 8 KB, quotas enforced", async () => {
  const area = memoryArea();
  const transport = createBrowserSyncTransport(area);
  const root = emptyRoot("a");
  root.records["preferences/theme"] = { clock: clock(1), data: "dark" };
  // Incompressible random text far above one item.
  let seed = 42;
  const big = Array.from({ length: 20_000 }, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return String.fromCharCode(48 + (seed % 75));
  }).join("");
  root.records["skills/s1"] = { clock: clock(2), data: { big } };
  await transport.writeRoot(root, undefined);
  for (const [key, value] of Object.entries(area.data))
    assert.ok(
      new TextEncoder().encode(key + JSON.stringify(value)).length <=
        BROWSER_SYNC_LIMITS.itemBytes,
      key,
    );
  assert.ok(Object.keys(area.data).length > 3);
  const read = await transport.readRoot();
  assert.equal(read.status, "ok");
  assert.deepEqual(read.status === "ok" && read.root.records, root.records);
  // Unchanged: same version.
  const again = await transport.readRoot(read.status === "ok" ? read.etag : "");
  assert.equal(again.status, "unchanged");

  // A part still on its way: wait, never read as missing.
  const part = Object.keys(area.data).find((key) => key.endsWith(":1"))!;
  const saved = area.data[part];
  delete area.data[part];
  await assert.rejects(transport.readRoot(), SyncNotReadyError);
  area.data[part] = saved;

  // Over the total quota: refused before writing anything.
  const huge = emptyRoot("a");
  for (let index = 0; index < 20; index++)
    huge.records[`skills/s${index}`] = {
      clock: clock(3),
      data: { big: big.slice(0, 6000) + index },
    };
  const before = JSON.stringify(area.data);
  await assert.rejects(transport.writeRoot(huge, undefined), SyncQuotaError);
  assert.equal(JSON.stringify(area.data), before);

  // Replaced large records leave no parts behind.
  const small = emptyRoot("a");
  small.records["preferences/theme"] = { clock: clock(4), data: "light" };
  small.records["skills/s1"] = { clock: clock(4), deleted: true };
  await transport.writeRoot(small, undefined);
  assert.deepEqual(Object.keys(area.data).sort(), [
    "r:preferences/theme",
    "r:skills/s1",
  ]);
});

test("WebDAV blobs are checked against their hash before use", async () => {
  const { gzip, sha256Hex } = await import("../src/shared/sync/codec");
  const { createWebDavTransport } = await import("../src/shared/sync/webdav");
  const { BlobIntegrityError } = await import("../src/shared/sync/transport");
  const good = new TextEncoder().encode("expected");
  const hash = await sha256Hex(good);
  const served = await gzip(new TextEncoder().encode("tampered"));
  const transport = createWebDavTransport(
    { url: "https://dav.test/x/" },
    (async () =>
      new Response(served.slice().buffer, { status: 200 })) as typeof fetch,
  );
  await assert.rejects(transport.getBlob(hash), BlobIntegrityError);
  const honest = createWebDavTransport(
    { url: "https://dav.test/x/" },
    (async () =>
      new Response((await gzip(good)).slice().buffer, {
        status: 200,
      })) as typeof fetch,
  );
  assert.deepEqual(await honest.getBlob(hash), good);
});
