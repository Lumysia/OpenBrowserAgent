import assert from "node:assert/strict";
import test from "node:test";
import { keepAnswers } from "../src/background/sync/service";
import { mergePreferences } from "../src/shared/default-preferences";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { ALL_ON, device, memoryServer, memoryTransport } from "./sync-fixtures";

// The third review's smaller speculative items, confirmed and kept as tests.

const PREFS = STORAGE_KEYS.preferences;
const PROVIDERS = STORAGE_KEYS.provider;
const SERVERS = STORAGE_KEYS.mcpServers;
type Prefs = Record<string, unknown>;

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, a, b };
}

test("review3 defaults: settings saved as defaults after their key was removed do not beat a newer edit", async () => {
  const { clock, a, b } = pair();
  await a.set(PREFS, mergePreferences({ accentColor: "blue" }));
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  // The settings key is removed on b (devtools), and the next app save
  // stores the defaults.
  await b.remove(PREFS);
  await b.confirmDeletes(["preferences"]);
  await b.set(PREFS, mergePreferences({}));
  clock.now += 1000;
  // a is asked too and applies the deletions.
  await a.confirmDeletes(["preferences"]);
  await a.set(PREFS, mergePreferences({ accentColor: "green" }));
  await a.sync("edit");
  for (let i = 0; i < 2; i++) {
    clock.now += 60_000;
    await b.sync();
    await a.sync();
  }
  for (const on of [a, b])
    assert.equal(on.get<Prefs>(PREFS).accentColor, "green", on.name);
});

const providers = (ids: number[]) =>
  Object.fromEntries(
    ids.map((id) => [`p${id}`, { apiKey: `k${id}`, model: "m" }]),
  );
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

test("review3 answers: each kind of mass-delete prompt for one collection gets its own answer", async () => {
  const { clock, a, b } = pair();
  await a.set(PROVIDERS, providers(range(1, 12)));
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await a.set(PROVIDERS, providers(range(7, 12)));
  await a.confirmDeletes(["providers"]);
  clock.now += 1000;
  await b.set(PROVIDERS, providers(range(1, 6)));
  const asked = await b.sync("edit");
  assert.deepEqual(
    (asked.massDelete ?? []).map((entry) => !!entry.local).sort(),
    [false, true],
  );
  // Keep what a deleted; delete what b deleted.
  await b.sync("manual", {
    massDelete: [
      { collections: ["providers"], keep: true, local: false },
      { collections: ["providers"], keep: false, local: true },
    ],
  });
  clock.now += 60_000;
  // a is asked about b's deletions and applies them.
  await a.confirmDeletes(["providers"]);
  for (const on of [a, b])
    assert.deepEqual(
      Object.keys(on.get<object>(PROVIDERS)).sort(),
      range(1, 6)
        .map((id) => `p${id}`)
        .sort(),
      on.name,
    );
});

test("review3 order: items restored after a local mass delete keep their place", async () => {
  const { clock, a, b } = pair();
  const list = range(1, 8).map((id) => ({
    id: `s${id}`,
    name: `S${id}`,
    createdAt: 100 - id,
  }));
  await a.set(SERVERS, list);
  await a.sync("edit");
  await b.sync();
  clock.now += 1000;
  await b.set(SERVERS, list.slice(0, 2));
  const asked = await b.sync("edit");
  assert.equal(asked.massDelete?.[0]?.local, true);
  await b.sync("manual", {
    massDelete: { collections: ["mcp-servers"], keep: true },
  });
  clock.now += 60_000;
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(
      on.get<Array<{ id: string }>>(SERVERS).map((server) => server.id),
      list.map((server) => server.id),
      on.name,
    );
});

test("review3 answers: a prompt asked again keeps its answer while another is open", () => {
  const asked = [
    { collection: "chats", count: 6, total: 8 },
    { collection: "chats", count: 6, total: 8, local: true as const },
  ];
  assert.deepEqual(keepAnswers(asked, [{ ...asked[0], keep: true }]), [
    { ...asked[0], keep: true },
    asked[1],
  ]);
  // With every prompt answered, they are asked again.
  assert.deepEqual(
    keepAnswers(asked, [
      { ...asked[0], keep: true },
      { ...asked[1], keep: false },
    ]),
    asked,
  );
});
