import assert from "node:assert/strict";
import test from "node:test";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { gzip, jsonBytes } from "../src/shared/sync/codec";
import { decodeRoot, emptyRoot, encodeRoot } from "../src/shared/sync/root";
import { SYNC_WARNINGS } from "../src/shared/sync/state";
import { createWebDavTransport } from "../src/shared/sync/webdav";
import { ALL_ON, device } from "./sync-fixtures";
import { memoryDav } from "./webdav-fixture";

// A root that cannot be read never stops sync for good. Koofr once left
// root.json.gz as an empty file: its PUT stores an empty version first and
// the upload stopped there. A device that finds the root unreadable rebuilds
// it from the copy of the root it replaced (root.prev.json.gz) and its own
// data, writes it, and shows a note; other devices upload what is missing.

const ROOT = "root.json.gz";
const PREVIOUS = "root.prev.json.gz";
const PROVIDERS = STORAGE_KEYS.provider;

const DAMAGES: Record<string, (good: Uint8Array) => Promise<Uint8Array>> = {
  "an empty root (upload stopped before any content)": async () =>
    new Uint8Array(),
  "a root cut off halfway": async (good) =>
    good.slice(0, Math.floor(good.length / 2)),
  "a root that is not JSON": async () =>
    gzip(new TextEncoder().encode('{"format": "openbrowseragent.sync.v3", ')),
};

function setup() {
  const clock = { now: 1_000_000_000 };
  const dav = memoryDav();
  const on = (name: string) =>
    device(
      name,
      createWebDavTransport({ url: dav.base }, dav.fetch),
      clock,
      ALL_ON,
    );
  return { clock, dav, on };
}

const models = (records: Record<string, unknown> | undefined) =>
  Object.fromEntries(
    Object.entries(records ?? {}).map(([id, value]) => [
      id,
      (value as { model: string }).model,
    ]),
  );

for (const [damage, damaged] of Object.entries(DAMAGES))
  for (const withPrevious of [true, false])
    test(`${damage}, ${withPrevious ? "with" : "without"} a previous copy: rebuilt, nothing lost`, async () => {
      const { clock, dav, on } = setup();
      const a = on("deviceA");
      const b = on("deviceB");
      const c = on("deviceC");
      await a.set(PROVIDERS, { p1: { model: "a" } });
      await a.sync("edit");
      clock.now += 60_000;
      await c.set(PROVIDERS, { p3: { model: "c" } });
      await c.sync("edit");
      // Each write kept the root it replaced.
      const previous = await decodeRoot(dav.get(PREVIOUS)!);
      assert.ok(previous.records["providers/p1"]);
      assert.ok(!previous.records["providers/p3"]);
      if (!withPrevious) dav.files.delete(`/sync/${PREVIOUS}`);
      dav.set(ROOT, await damaged(dav.get(ROOT)!));

      clock.now += 60_000;
      await b.set(PROVIDERS, { p2: { model: "b" } });
      const result = await b.sync("edit");
      assert.deepEqual(result.warnings, [SYNC_WARNINGS.recoveredRoot]);
      const rebuilt = await decodeRoot(dav.get(ROOT)!);
      assert.ok(rebuilt.records["providers/p2"]);
      // The previous copy's records come back with it.
      assert.equal(!!rebuilt.records["providers/p1"], withPrevious);
      assert.deepEqual(
        models(b.get(PROVIDERS)),
        withPrevious ? { p1: "a", p2: "b" } : { p2: "b" },
      );

      // The other devices upload what the rebuilt root misses; no device
      // lost anything, and nothing was deleted.
      for (const each of [a, c, b, a, c]) {
        clock.now += 60_000;
        assert.deepEqual((await each.sync()).warnings, []);
      }
      for (const each of [a, b, c])
        assert.deepEqual(
          models(each.get(PROVIDERS)),
          { p1: "a", p2: "b", p3: "c" },
          each.name,
        );
      const root = await decodeRoot(dav.get(ROOT)!);
      assert.ok(Object.values(root.records).every((record) => !record.deleted));
    });

test("a damaged root with a damaged previous copy is rebuilt from local data", async () => {
  const { clock, dav, on } = setup();
  const a = on("deviceA");
  await a.set(PROVIDERS, { p1: { model: "a" } });
  await a.sync("edit");
  await a.set(PROVIDERS, { p1: { model: "a2" } });
  await a.sync("edit");
  dav.set(ROOT, new Uint8Array());
  dav.set(PREVIOUS, new Uint8Array([31, 139]));
  clock.now += 60_000;
  const result = await a.sync();
  assert.deepEqual(result.warnings, [SYNC_WARNINGS.recoveredRoot]);
  const root = await decodeRoot(dav.get(ROOT)!);
  assert.equal(
    (root.records["providers/p1"].data as { model: string }).model,
    "a2",
  );
});

test("a root in an older format is replaced quietly, local data kept", async () => {
  const { dav, on } = setup();
  const old = {
    ...emptyRoot("old"),
    format: "openbrowseragent.sync.v2",
    records: {
      "providers/p1": {
        clock: "000000000000001.0000.old",
        data: { model: "x" },
      },
      "bridges/b1": { clock: "000000000000001.0000.old", data: { id: "b1" } },
    },
  };
  dav.set(ROOT, await gzip(jsonBytes(old)));
  const a = on("deviceA");
  await a.set(PROVIDERS, { p2: { model: "a" } });
  const result = await a.sync("edit");
  assert.deepEqual(result.warnings, []);
  const root = await decodeRoot(dav.get(ROOT)!);
  assert.equal(root.format, "openbrowseragent.sync.v3");
  assert.deepEqual(Object.keys(root.records).sort(), [
    "providers/p2",
    "sync-groups/syncKeys",
  ]);
  assert.deepEqual(models(a.get(PROVIDERS)), { p2: "a" });
  // An older root is not kept as the previous copy.
  assert.equal(dav.get(PREVIOUS), undefined);
});

test("a root in a newer format stops sync without touching it", async () => {
  const { dav, on } = setup();
  const newer = await encodeRoot({
    ...emptyRoot("future"),
    format: "openbrowseragent.sync.v99" as never,
  });
  dav.set(ROOT, newer);
  const a = on("deviceA");
  await a.set(PROVIDERS, { p2: { model: "a" } });
  await assert.rejects(a.sync("edit"), /newer|Unsupported/);
  assert.deepEqual(dav.get(ROOT), newer);
});
