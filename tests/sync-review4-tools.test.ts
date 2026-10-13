import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { runLocalBridgesAction } from "../src/background/local-execution-bridge-tools";
import { testMcpServer } from "../src/background/mcp-tools";
import { skillsTool } from "../src/background/tools/skills";
import type { ToolContext } from "../src/background/tools/types";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { createSkillPackage } from "../src/shared/skills";
import { SYNC_COLLECTIONS } from "../src/shared/sync/collections";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  type Device,
} from "./sync-fixtures";

// Background agent tools edit synced lists. A sync round that stores
// another device's change while a tool waits (on an MCP server, a native
// host) or between its read and its write must not be undone by the tool.

type Item = { id: string };
const ids = (on: Device, key: string) =>
  on.get<Item[]>(key).map((item) => item.id);

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, a, b };
}

// Both devices hold `items`; b adds `added`, which a has not downloaded yet.
async function addedElsewhere(key: string, items: Item[], added: Item) {
  const { clock, a, b } = pair();
  await a.set(key, items);
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await b.set(key, [...b.get<Item[]>(key), added]);
  await b.sync("edit");
  return { clock, a, b };
}

// The tool runs against a's storage.
function useDevice(t: TestContext, on: Device, extra: object = {}) {
  const previous = globalThis.chrome;
  t.after(() => {
    globalThis.chrome = previous;
  });
  globalThis.chrome = { storage: { local: on.env.local }, ...extra } as never;
}

// a's poll downloads b's addition; then both devices keep it.
async function downloads(on: Device, key: string, id: string) {
  await on.sync();
  return on.get<Item[]>(key).some((item) => item.id === id);
}

async function keptEverywhere(
  clock: { now: number },
  a: Device,
  b: Device,
  key: string,
  id: string,
) {
  await a.settle();
  clock.now += 60_000;
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(
    [ids(a, key), ids(b, key)].map((list) => list.includes(id)),
    [true, true],
  );
}

const mcpServer = (id: string) => ({
  id,
  name: id,
  description: "",
  url: `https://${id}.example/mcp`,
  enabled: false,
  headers: {},
  tools: [],
  lastTestError: "",
  createdAt: 1,
  updatedAt: 1,
});

test("review4 B1: an MCP server added on another device survives an agent's MCP test on this one", async (t) => {
  const MCP = STORAGE_KEYS.mcpServers;
  const { clock, a, b } = await addedElsewhere(
    MCP,
    [mcpServer("s1"), mcpServer("s2")],
    mcpServer("s3"),
  );
  useDevice(t, a);
  let downloaded = false;
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  // While the MCP server answers, a's poll downloads s3.
  globalThis.fetch = (async () => {
    clock.now += 1000;
    downloaded = await downloads(a, MCP, "s3");
    throw new Error("connection refused");
  }) as never;
  const result = await testMcpServer({ serverId: "s1" });
  assert.equal(downloaded, true);
  assert.equal(result.success, false);
  assert.equal(
    a.get<Array<{ id: string; lastTestError: string }>>(MCP)[0].lastTestError,
    "connection refused",
  );
  await keptEverywhere(clock, a, b, MCP, "s3");
});

const bridge = (id: string) => ({
  id,
  name: id,
  hostName: "openbrowseragent.local_execution_bridge",
  bridgeKey: id,
  secret: "disposable-fixture",
  createdAt: 1,
  updatedAt: 1,
});

test("review4 B1: a bridge added on another device survives an agent's bridge test on this one", async (t) => {
  const BRIDGES = STORAGE_KEYS.localExecutionBridges;
  const { clock, a, b } = await addedElsewhere(
    BRIDGES,
    [bridge("b1")],
    bridge("b2"),
  );
  let downloaded = false;
  // The native host never answers; meanwhile a's poll downloads b2.
  const connectNative = () => {
    const disconnects: Array<() => void> = [];
    return {
      onMessage: { addListener() {}, removeListener() {} },
      onDisconnect: {
        addListener: (listener: () => void) => disconnects.push(listener),
        removeListener() {},
      },
      disconnect() {},
      postMessage() {
        void (async () => {
          clock.now += 1000;
          downloaded = await downloads(a, BRIDGES, "b2");
          for (const listener of disconnects) listener();
        })();
      },
    };
  };
  useDevice(t, a, { runtime: { connectNative } });
  const result = await runLocalBridgesAction({ action: "test", id: "b1" });
  assert.equal(downloaded, true);
  assert.equal((result as { success: boolean }).success, false);
  await keptEverywhere(clock, a, b, BRIDGES, "b2");
});

// The download lands right after the tool read the list.
function downloadAfterFirstRead(on: Device, key: string, id: string) {
  const area = on.env.local;
  const get = area.get.bind(area);
  const state = { downloaded: false };
  let armed = true;
  area.get = async (keys) => {
    const value = await get(keys);
    if (armed && [keys].flat().includes(key)) {
      armed = false;
      state.downloaded = await downloads(on, key, id);
    }
    return value;
  };
  return state;
}

test("review4 B1: a skill added on another device survives an agent's skill edit on this one", async (t) => {
  const SKILLS = STORAGE_KEYS.skills;
  const skill = (name: string) =>
    createSkillPackage({ name, description: name, instruction: name });
  const mine = skill("mine");
  const { clock, a, b } = await addedElsewhere(SKILLS, [mine], skill("theirs"));
  useDevice(t, a);
  const added = b.get<Item[]>(SKILLS)[1].id;
  const state = downloadAfterFirstRead(a, SKILLS, added);
  const result = await skillsTool.execute(
    { action: "write", name: "mine", path: "notes.md", content: "x" },
    { run: { skills: [mine] } } as unknown as ToolContext,
  );
  assert.equal(result.isError, undefined);
  assert.equal(state.downloaded, true);
  assert.ok(
    a
      .get<Array<{ id: string; files: Array<{ path: string }> }>>(SKILLS)
      .find((item) => item.id === mine.id)
      ?.files.some((file) => file.path === "notes.md"),
  );
  await keptEverywhere(clock, a, b, SKILLS, added);
});

// Whole-value writes of synced data undo changes stored meanwhile; synced
// items only offer `update` and the explicit `replace`.
test("review4 B1: synced storage items have no blind set", () => {
  const synced = new Set(
    SYNC_COLLECTIONS.flatMap((collection) => collection.keys),
  );
  const items = Object.values(storage).filter((item) => synced.has(item.key));
  assert.ok(items.length >= 8);
  for (const item of items) {
    assert.equal("set" in item, false, item.key);
    assert.equal(typeof item.update, "function", item.key);
    assert.equal(typeof (item as { replace?: unknown }).replace, "function");
  }
});
