import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SYNC_GROUP_SETTINGS,
  mergeSyncGroupSettings,
  STORAGE_KEYS,
} from "../src/shared/storage-keys";
import { gzip, jsonBytes } from "../src/shared/sync/codec";
import { cleanUpOldSyncData } from "../src/shared/sync/obsolete";
import { decodeRoot, ROOT_FORMAT } from "../src/shared/sync/root";
import { device, memoryServer, memoryTransport } from "./sync-fixtures";

// Upgrading from the last release (sync format v2): local data stays as it
// is, the old sync settings go (the new groups start from their defaults),
// and the server's old root is replaced on the first sync.

const OLD_CLOCK = "000001000000000.0000.deviceA";

// What the last release stored (taken from its storage shapes).
const LAST_RELEASE: Record<string, unknown> = {
  [STORAGE_KEYS.language]: "de-DE",
  [STORAGE_KEYS.preferences]: { colorScheme: "dark" },
  [STORAGE_KEYS.provider]: {
    openai: { type: "openai", apiKey: "sk-local", model: "gpt" },
  },
  [STORAGE_KEYS.agents]: [{ id: "ag", name: "Agent", createdAt: 1 }],
  [STORAGE_KEYS.agentWorkspaces]: [
    {
      agentId: "ag",
      files: [
        {
          path: "MEMORY.md",
          content: "# Memory\n\nfacts",
          kind: "markdown",
          updatedAt: 2,
        },
        {
          path: "NOTES.md",
          content: "# Notes\n\nnotes",
          kind: "markdown",
          updatedAt: 2,
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  [STORAGE_KEYS.skills]: [
    { id: "s1", name: "s1", files: [{ path: "SKILL.md", content: "x" }] },
  ],
  [STORAGE_KEYS.mcpServers]: [
    { id: "m1", name: "M", url: "https://mcp.test", headers: { A: "b" } },
  ],
  [STORAGE_KEYS.localExecutionBridges]: [
    { id: "b1", name: "bridge", secret: "s", bridgeKey: "k" },
  ],
  [STORAGE_KEYS.chats]: [{ id: "c1", title: "Chat", createdAt: 1 }],
  [`${STORAGE_KEYS.chats}/c1`]: { messages: [{ id: "m1", content: "hi" }] },
  [STORAGE_KEYS.activeSyncBackendId]: "webdav",
  [STORAGE_KEYS.syncDeviceId]: "deviceA",
  "sync-data-settings": {
    syncProviders: true,
    syncAgents: true,
    syncSkills: true,
    syncMcpServers: true,
    syncLocalExecutionBridges: true,
    syncChats: true,
    syncChatAttachments: true,
  },
  [`${STORAGE_KEYS.syncClocks}:providers`]: {
    openai: { clock: OLD_CLOCK, dataHash: "x" },
  },
  [`${STORAGE_KEYS.syncClocks}:bridges`]: {
    b1: { clock: OLD_CLOCK, dataHash: "x" },
  },
  [`${STORAGE_KEYS.syncClocks}:sync-data`]: {
    syncChats: { clock: OLD_CLOCK, dataHash: "x" },
  },
  [`${STORAGE_KEYS.syncBases}:bridges`]: [],
  [`${STORAGE_KEYS.syncState}:test`]: {
    scope: "test",
    remote: {
      root: {
        format: "openbrowseragent.sync.v2",
        writer: "deviceA",
        records: {},
        garbage: [],
      },
      etag: '"v1"',
    },
  },
};

const USER_DATA = [
  STORAGE_KEYS.language,
  STORAGE_KEYS.preferences,
  STORAGE_KEYS.provider,
  STORAGE_KEYS.agents,
  STORAGE_KEYS.agentWorkspaces,
  STORAGE_KEYS.skills,
  STORAGE_KEYS.mcpServers,
  STORAGE_KEYS.localExecutionBridges,
  STORAGE_KEYS.chats,
  `${STORAGE_KEYS.chats}/c1`,
  STORAGE_KEYS.activeSyncBackendId,
  STORAGE_KEYS.syncDeviceId,
];

test("upgrading keeps all local data and resets the sync settings", async () => {
  const clock = { now: 1_000_100_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock);
  for (const [key, value] of Object.entries(LAST_RELEASE)) a.seed(key, value);
  // The server still holds the last release's root, bridges included.
  server.root = await gzip(
    jsonBytes({
      format: "openbrowseragent.sync.v2",
      writer: "deviceA",
      records: {
        "bridges/b1": { clock: OLD_CLOCK, data: { id: "b1", secret: "s" } },
        "providers/openai": {
          clock: OLD_CLOCK,
          data: { apiKey: "sk-local", model: "gpt" },
        },
      },
      garbage: [],
    }),
  );
  server.etag = '"v1"';

  await cleanUpOldSyncData(a.env.local);
  for (const key of USER_DATA)
    assert.deepEqual(a.get(key), LAST_RELEASE[key], key);
  for (const key of [
    "sync-data-settings",
    `${STORAGE_KEYS.syncClocks}:bridges`,
    `${STORAGE_KEYS.syncClocks}:sync-data`,
    `${STORAGE_KEYS.syncBases}:bridges`,
    `${STORAGE_KEYS.syncState}:test`,
  ])
    assert.equal(a.get(key), undefined, key);
  assert.deepEqual(
    a.get(`${STORAGE_KEYS.syncClocks}:providers`),
    LAST_RELEASE[`${STORAGE_KEYS.syncClocks}:providers`],
  );
  assert.deepEqual(
    mergeSyncGroupSettings(a.get(STORAGE_KEYS.syncGroups)),
    DEFAULT_SYNC_GROUP_SETTINGS,
  );
  assert.equal(a.get(STORAGE_KEYS.syncFormat), ROOT_FORMAT);

  // Once per format: data stored afterwards stays.
  a.seed(`${STORAGE_KEYS.syncState}:test`, { scope: "test" });
  await cleanUpOldSyncData(a.env.local);
  assert.ok(a.get(`${STORAGE_KEYS.syncState}:test`));

  // The first sync replaces the old root; local data stays as it was.
  await a.sync("startup");
  const root = await decodeRoot(server.root!);
  assert.equal(root.format, ROOT_FORMAT);
  assert.ok(!Object.keys(root.records).some((id) => id.startsWith("bridges/")));
  assert.deepEqual(root.records["providers/openai"].data, {
    type: "openai",
    model: "gpt",
  });
  // Keys are off by default: no key leaves the device.
  assert.ok(
    !Object.keys(root.records).some((id) => id.startsWith("provider-keys/")),
  );
  for (const key of USER_DATA)
    assert.deepEqual(a.get(key), LAST_RELEASE[key], key);
});
