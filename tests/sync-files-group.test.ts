import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_MEMORY_MAX_CHARS,
  WORKSPACE_USER_MAX_CHARS,
} from "../src/shared/config";
import { STORAGE_KEYS, SYNC_GROUPS } from "../src/shared/storage-keys";
import {
  BROWSER_SYNC_LIMITS,
  createBrowserSyncTransport,
} from "../src/shared/sync/browser-sync";
import { decodeRoot } from "../src/shared/sync/root";
import { createWorkspace, WORKSPACE_FILE_PATH } from "../src/shared/workspace";
import { memoryArea } from "./fake-chrome";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  type Device,
} from "./sync-fixtures";

// Files (skill files, workspace files other than MEMORY.md and USER.md)
// sync only where their group is on and the backend has room. A device
// without them shows the skills and agents, and never uploads its empty
// files over the real ones or deletes them.

const SKILLS = STORAGE_KEYS.skills;
const WORKSPACES = STORAGE_KEYS.agentWorkspaces;
const FILES_OFF = { ...ALL_ON, [SYNC_GROUPS.files]: false };

type Files = { files?: Array<{ path: string; content: string }> };

const paths = (on: Device, key: string) =>
  (on.get<Files[]>(key)?.[0]?.files ?? []).map((file) => file.path).sort();

const file = (path: string, content: string) => ({
  path,
  content,
  kind: "markdown",
  updatedAt: 1,
});

test("a device without files gets skills and agents' memory, and keeps the files elsewhere intact", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, FILES_OFF);
  await a.set(SKILLS, [
    {
      id: "s1",
      name: "s1",
      description: "d",
      files: [file("SKILL.md", "---\nname: s1\n---\nbody")],
    },
  ]);
  await a.set(WORKSPACES, [{ ...createWorkspace("ag", 1), agentId: "ag" }]);
  await a.sync("edit");
  await b.sync();
  assert.deepEqual(b.get(SKILLS), [{ id: "s1", name: "s1", description: "d" }]);
  assert.deepEqual(paths(b, WORKSPACES), [
    WORKSPACE_FILE_PATH.memory,
    WORKSPACE_FILE_PATH.user,
  ]);

  // b edits the agent's memory and the skill's description.
  clock.now += 60_000;
  const workspace = b.get<Array<Files & object>>(WORKSPACES)[0];
  await b.set(WORKSPACES, [
    {
      ...workspace,
      files: workspace.files!.map((entry) =>
        entry.path === WORKSPACE_FILE_PATH.memory
          ? { ...entry, content: "# Memory\n\ntea", updatedAt: clock.now }
          : entry,
      ),
    },
  ]);
  await b.set(SKILLS, [{ id: "s1", name: "s1", description: "new" }]);
  await b.sync("edit");
  await a.sync();
  assert.deepEqual(paths(a, WORKSPACES), [
    WORKSPACE_FILE_PATH.memory,
    WORKSPACE_FILE_PATH.notes,
    WORKSPACE_FILE_PATH.user,
  ]);
  assert.equal(
    a
      .get<Files[]>(WORKSPACES)[0]
      .files!.find((entry) => entry.path === WORKSPACE_FILE_PATH.memory)
      ?.content,
    "# Memory\n\ntea",
  );
  assert.deepEqual(paths(a, SKILLS), ["SKILL.md"]);
  assert.equal(
    a.get<Array<{ description: string }>>(SKILLS)[0].description,
    "new",
  );
  const root = await decodeRoot(server.root!);
  for (const id of ["skill-files/s1", "workspace-files/ag"])
    assert.ok(root.records[id] && !root.records[id].deleted, id);

  // Files turned on later: b gets them, nothing was lost.
  b.context.settings[SYNC_GROUPS.files] = true;
  await b.sync();
  assert.deepEqual(paths(b, SKILLS), ["SKILL.md"]);
  assert.deepEqual(paths(b, WORKSPACES), [
    WORKSPACE_FILE_PATH.memory,
    WORKSPACE_FILE_PATH.notes,
    WORKSPACE_FILE_PATH.user,
  ]);
  await a.sync();
  assert.deepEqual(paths(a, SKILLS), ["SKILL.md"]);
});

test("browser sync never holds files, even with the files group on", async () => {
  const clock = { now: 1_000_000_000 };
  const area = memoryArea();
  const a = device(
    "deviceA",
    createBrowserSyncTransport(area, () => clock.now),
    clock,
    ALL_ON,
  );
  await a.set(SKILLS, [
    { id: "s1", name: "s1", files: [file("SKILL.md", "body")] },
  ]);
  await a.set(WORKSPACES, [createWorkspace("ag", 1)]);
  await a.sync("edit");
  const keys = Object.keys(area.data);
  assert.ok(keys.includes("r:skills/s1") && keys.includes("r:workspaces/ag"));
  assert.ok(
    !keys.some((key) => /^r:(skill-files|workspace-files|chats)\//.test(key)),
  );
});

// What a well-used setup stores in browser account sync: several AI
// providers with keys, five agents with full MEMORY.md and USER.md, ten
// MCP servers with headers, a dozen skills.
test("a realistic set of settings fits browser account sync with room to spare", async () => {
  const clock = { now: 1_000_000_000 };
  const area = memoryArea();
  const a = device(
    "deviceA",
    createBrowserSyncTransport(area, () => clock.now),
    clock,
    ALL_ON,
  );
  // Random letters and spaces: compresses about as badly as prose can.
  let state = 1;
  const text = (size: number) =>
    Array.from({ length: size }, () => {
      state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
      return " abcdefghijklmnopqrstuvwxyz"[state % 27];
    }).join("");
  await a.set(
    STORAGE_KEYS.provider,
    Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `provider-${index}`,
        {
          type: "openai-compatible",
          name: `Provider ${index}`,
          baseUrl: `https://api${index}.example.com/v1`,
          apiKey: `sk-${text(64)}`,
          models: Array.from({ length: 8 }, (_, model) => ({
            id: `model-${model}`,
            name: `Model ${model}`,
            contextWindow: 128_000,
          })),
        },
      ]),
    ),
  );
  const agents = Array.from({ length: 5 }, (_, index) => `agent-${index}`);
  await a.set(
    STORAGE_KEYS.agents,
    agents.map((id) => ({
      id,
      name: id,
      instructions: text(1_500),
      tools: ["read", "act", "tabs", "workspace", "skills"],
      createdAt: 1,
    })),
  );
  await a.set(
    WORKSPACES,
    agents.map((id) => ({
      ...createWorkspace(id, 1),
      files: [
        file("MEMORY.md", text(WORKSPACE_MEMORY_MAX_CHARS)),
        file("USER.md", text(WORKSPACE_USER_MAX_CHARS)),
        file("NOTES.md", text(40_000)),
      ],
    })),
  );
  await a.set(
    STORAGE_KEYS.mcpServers,
    Array.from({ length: 10 }, (_, index) => ({
      id: `mcp-${index}`,
      name: `MCP ${index}`,
      url: `https://mcp${index}.example.com/mcp`,
      enabled: true,
      headers: { Authorization: `Bearer ${text(48)}` },
    })),
  );
  await a.set(
    SKILLS,
    Array.from({ length: 12 }, (_, index) => ({
      id: `skill-${index}`,
      name: `skill-${index}`,
      description: text(200),
      files: [file("SKILL.md", text(8_000))],
    })),
  );
  await a.sync("edit");
  const used = Object.entries(area.data).reduce(
    (total, [key, value]) =>
      total +
      key.length +
      new TextEncoder().encode(JSON.stringify(value)).length,
    0,
  );
  // Measured: about 39 KB in 69 items, of 100 KB and 512 items.
  assert.ok(
    used < BROWSER_SYNC_LIMITS.totalBytes * 0.6,
    `browser sync holds ${used} bytes`,
  );
  assert.ok(Object.keys(area.data).length < BROWSER_SYNC_LIMITS.items / 4);
});
