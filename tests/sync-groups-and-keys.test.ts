import assert from "node:assert/strict";
import test from "node:test";
import { setPassphrase } from "../src/background/sync/passphrase";
import { STORAGE_KEYS, SYNC_GROUPS } from "../src/shared/storage-keys";
import { gunzip, bytesText } from "../src/shared/sync/codec";
import { loadLocalKeyring } from "../src/shared/sync/keys";
import { decodeRoot } from "../src/shared/sync/root";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  TEST_PASSPHRASE,
  TEST_SCOPE,
  type Device,
  type MemoryServer,
} from "./sync-fixtures";

// The keys group: API keys and MCP headers sync end to end encrypted with
// the sync passphrase; a device without it keeps its own keys and leaves
// the synced ones alone.

const PROVIDERS = STORAGE_KEYS.provider;
const MCP = STORAGE_KEYS.mcpServers;
type Providers = Record<string, { apiKey?: string; model?: string }>;

const KEYS_OFF = { ...ALL_ON, [SYNC_GROUPS.keys]: false };

function setup() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const on = (name: string, settings = ALL_ON) =>
    device(name, memoryTransport(server), clock, settings);
  return { clock, server, on };
}

const rootText = async (server: MemoryServer) =>
  bytesText(await gunzip(server.root!));

const apiKey = (on: Device, id = "openai") =>
  on.get<Providers>(PROVIDERS)?.[id]?.apiKey;

// A device with key sync on that has no key for the passphrase (yet).
function locked(on: Device) {
  delete on.env.local.data[`${STORAGE_KEYS.syncKeyring}:${TEST_SCOPE}`];
  return on;
}

const noTurnOn = async () => undefined;

test("keys travel sealed: the server never sees an API key or a header", async () => {
  const { server, on } = setup();
  const a = on("deviceA");
  const b = on("deviceB");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-secret", model: "gpt" } });
  await a.set(MCP, [
    {
      id: "s1",
      name: "S",
      url: "https://mcp.test",
      headers: { "X-Key": "h-secret" },
    },
  ]);
  await a.sync("edit");
  const text = await rootText(server);
  assert.ok(!text.includes("sk-secret") && !text.includes("h-secret"));
  const root = await decodeRoot(server.root!);
  assert.ok(root.keyring);
  const sealed = root.records["provider-keys/openai"];
  assert.equal(typeof sealed.sealed, "string");
  assert.equal("data" in sealed, false);
  assert.deepEqual(root.records["providers/openai"].data, { model: "gpt" });
  await b.sync();
  assert.equal(apiKey(b), "sk-secret");
  assert.deepEqual(b.get<Array<{ headers: object }>>(MCP)[0].headers, {
    "X-Key": "h-secret",
  });
});

test("without the passphrase a device keeps its keys and leaves the synced ones", async () => {
  const { clock, server, on } = setup();
  const a = on("deviceA");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-account", model: "gpt" } });
  await a.sync("edit");
  const before = (await decodeRoot(server.root!)).records[
    "provider-keys/openai"
  ];
  // Key sync on, passphrase never entered here; and a device with key sync
  // off. Both have a key of their own for the same AI provider.
  const c = locked(on("deviceC"));
  const d = on("deviceD", KEYS_OFF);
  for (const each of [c, d]) {
    clock.now += 60_000;
    await each.set(PROVIDERS, {
      openai: { apiKey: `sk-${each.name}`, model: "gpt" },
    });
    const result = await each.sync("edit");
    assert.equal(apiKey(each), `sk-${each.name}`);
    assert.equal(each.get<Providers>(PROVIDERS).openai.model, "gpt");
    if (each === c)
      assert.deepEqual(result.keys, { onServer: true, unlocked: false });
  }
  const after = (await decodeRoot(server.root!)).records[
    "provider-keys/openai"
  ];
  assert.deepEqual(after, before);
  await a.sync();
  assert.equal(apiKey(a), "sk-account");
});

test("a wrong passphrase is reported and stores nothing; the right one unlocks", async () => {
  const { server, on } = setup();
  const a = on("deviceA");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-account", model: "gpt" } });
  await a.sync("edit");
  const c = locked(on("deviceC"));
  await c.set(PROVIDERS, { openai: { apiKey: "sk-mine" } });
  assert.equal(
    await setPassphrase(c.context, "not the passphrase", noTurnOn),
    "wrong",
  );
  assert.equal(await loadLocalKeyring(c.env.local, TEST_SCOPE), undefined);
  await c.sync();
  assert.equal(apiKey(c), "sk-mine");
  assert.equal(
    await setPassphrase(c.context, TEST_PASSPHRASE, noTurnOn),
    "set",
  );
  const result = await c.sync();
  assert.deepEqual(result.keys, { onServer: true, unlocked: true });
  // Both changed the key without a common version: the newer one wins.
  assert.equal(apiKey(c), "sk-mine");
  await a.sync();
  assert.equal(apiKey(a), "sk-mine");
  assert.ok(!(await rootText(server)).includes("sk-mine"));
});

test("changing the passphrase seals the keys again; other devices ask once", async () => {
  const { clock, server, on } = setup();
  const a = on("deviceA");
  const b = on("deviceB");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-1", model: "gpt" } });
  await a.sync("edit");
  await b.sync();
  const old = await decodeRoot(server.root!);
  assert.equal(
    await setPassphrase(a.context, "a new passphrase", noTurnOn),
    "set",
  );
  clock.now += 60_000;
  await a.sync();
  const changed = await decodeRoot(server.root!);
  assert.notEqual(changed.keyring!.check, old.keyring!.check);
  assert.notEqual(
    changed.records["provider-keys/openai"].sealed,
    old.records["provider-keys/openai"].sealed,
  );
  assert.equal(apiKey(a), "sk-1");
  // The old key is kept until a read shows the new keyring took hold (a
  // server that ignores If-Match may have dropped the write).
  assert.ok((await loadLocalKeyring(a.env.local, TEST_SCOPE))?.previous);
  await a.sync();
  assert.equal(
    (await loadLocalKeyring(a.env.local, TEST_SCOPE))?.previous,
    undefined,
  );
  // b's key belongs to the old passphrase: it keeps its keys and asks.
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "sk-2", model: "gpt" } });
  await a.sync("edit");
  const result = await b.sync();
  assert.deepEqual(result.keys, { onServer: true, unlocked: false });
  assert.equal(apiKey(b), "sk-1");
  assert.equal(
    await setPassphrase(b.context, TEST_PASSPHRASE, noTurnOn),
    "wrong",
  );
  assert.equal(
    await setPassphrase(b.context, "a new passphrase", noTurnOn),
    "set",
  );
  await b.sync();
  assert.equal(apiKey(b), "sk-2");
});

test("turning keys off removes them from the server; every device keeps its own", async () => {
  const { clock, server, on } = setup();
  const a = on("deviceA");
  const b = on("deviceB");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-1", model: "gpt" } });
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await a.set(STORAGE_KEYS.syncGroups, { [SYNC_GROUPS.keys]: false });
  a.context.settings[SYNC_GROUPS.keys] = false;
  await a.sync("edit");
  const root = await decodeRoot(server.root!);
  assert.equal(root.keyring, undefined);
  assert.deepEqual(
    Object.keys(root.records).filter((id) => id.startsWith("provider-keys/")),
    [],
  );
  assert.equal(await loadLocalKeyring(a.env.local, TEST_SCOPE), undefined);
  // b learns the switch is off (its own setting follows) and keeps its keys.
  await b.sync();
  assert.equal(
    b.get<Record<string, boolean>>(STORAGE_KEYS.syncGroups)[SYNC_GROUPS.keys],
    false,
  );
  for (const each of [a, b]) assert.equal(apiKey(each), "sk-1", each.name);
});

test("a device that has not seen keys turned on does not remove them", async () => {
  const { clock, server, on } = setup();
  const a = on("deviceA");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-1", model: "gpt" } });
  await a.sync("edit");
  // d still has keys off locally, and never changed that setting.
  const d = on("deviceD", KEYS_OFF);
  clock.now += 60_000;
  await d.set(PROVIDERS, { other: { model: "m" } });
  await d.sync("edit");
  const root = await decodeRoot(server.root!);
  assert.ok(root.keyring);
  assert.ok(root.records["provider-keys/openai"]?.sealed);
  assert.equal(
    d.get<Record<string, boolean>>(STORAGE_KEYS.syncGroups)[SYNC_GROUPS.keys],
    true,
  );
});

test("an API key cleared on one device is cleared on the others; an empty one never replaces it", async () => {
  const { clock, on } = setup();
  const a = on("deviceA");
  await a.set(PROVIDERS, { openai: { apiKey: "sk-1", model: "gpt" } });
  await a.sync("edit");
  // A new device whose provider form stored an empty key before joining.
  const b = on("deviceB");
  await b.set(PROVIDERS, { openai: { apiKey: "", model: "gpt" } });
  clock.now += 60_000;
  await b.sync("startup");
  assert.equal(apiKey(b), "sk-1");
  clock.now += 60_000;
  await a.set(PROVIDERS, { openai: { apiKey: "", model: "gpt" } });
  await a.sync("edit");
  await b.sync();
  assert.ok(!apiKey(b));
  assert.equal(b.get<Providers>(PROVIDERS).openai.model, "gpt");
});
