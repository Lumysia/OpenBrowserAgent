import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentDraft,
  DEFAULT_AGENT_ID,
  resolveAgent,
} from "../src/shared/agents";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { syncCollection } from "../src/shared/sync/collections";
import { mergeFiles } from "../src/shared/sync/merge-content";
import { decodeRoot } from "../src/shared/sync/root";
import type { Agent, AgentWorkspace } from "../src/shared/types";
import { upsertWorkspaceFile } from "../src/shared/workspace";
import {
  mutateWorkspace,
  storeAgentWorkspaces,
  workspaceForAgent,
} from "../src/shared/workspace-storage";
import { onDevice } from "./sync-app-fixture";
import {
  ALL_ON,
  device,
  memoryServer,
  memoryTransport,
  type Device,
} from "./sync-fixtures";

const WORKSPACES = STORAGE_KEYS.agentWorkspaces;
const files = (on: Device, agentId: string) =>
  (on.get<AgentWorkspace[]>(WORKSPACES) ?? [])
    .find((workspace) => workspace.agentId === agentId)
    ?.files.map((file) => `${file.path}=${JSON.stringify(file.content)}`)
    .sort();

const DEFAULT_FILES = [
  'MEMORY.md="# Memory\\n\\n"',
  'NOTES.md="# Notes\\n\\n"',
  'USER.md="# User\\n\\n"',
];
const TEA = "# Memory\n\nUser likes tea.\n";
const BOB = "# User\n\nCalled Bob.\n";

function writeFile(agent: Agent, path: string, content: string) {
  return async () => {
    const workspace = await workspaceForAgent(agent, true);
    await mutateWorkspace(workspace, (current) =>
      upsertWorkspaceFile(current, path, content),
    );
  };
}

// A, then B, each with agent X; A's X has a memory B has not seen.
async function agentWithMemory() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await a.sync();
  await b.sync();
  const x = createAgentDraft("X");
  await onDevice(a, async () => {
    await storage.agents.update((list) => [...list, x]);
    await writeFile(x, "MEMORY.md", TEA)();
  });
  await a.sync("edit");
  clock.now += 60_000;
  return { a, b, x, server, clock };
}

// The next rounds on both devices, then what each has.
async function settle(a: Device, b: Device, agentId: string) {
  await b.sync("edit");
  await a.sync();
  await b.sync();
  return [files(a, agentId), files(b, agentId)];
}

// Two browsers each run the default agent before they first sync (or
// while agent sync is off): each creates the default agent's workspace.
test("review7 D1: two devices creating the same default workspace get no conflict copies", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  const agent = resolveAgent(undefined, DEFAULT_AGENT_ID);
  await onDevice(a, () => workspaceForAgent(agent, true));
  clock.now += 60_000;
  await onDevice(b, () => workspaceForAgent(agent, true));
  await a.sync("edit");
  for (const result of await settle(a, b, DEFAULT_AGENT_ID))
    assert.deepEqual(result, DEFAULT_FILES);
});

// B has the agents page open (its effect stores a workspace for every agent
// that has none, on every change of agents/workspaces). A round on B stores
// the agents collection, then the workspaces collection: the page reacts
// to the first write in between.
test("review7 D2: a default workspace the agents page creates before the real one arrives does not replace it", async () => {
  const { a, b, x } = await agentWithMemory();
  let page: Promise<unknown> | undefined;
  b.env.local.listeners.push((changes) => {
    if (changes[STORAGE_KEYS.agents] && !page)
      page = onDevice(b, async () =>
        storeAgentWorkspaces(await storage.agents.get()),
      );
  });
  await b.sync();
  await page;
  assert.deepEqual(files(b, x.id), DEFAULT_FILES, "the page won the race");
  const expected = [
    'MEMORY.md="# Memory\\n\\nUser likes tea.\\n"',
    'NOTES.md="# Notes\\n\\n"',
    'USER.md="# User\\n\\n"',
  ];
  for (const result of await settle(a, b, x.id))
    assert.deepEqual(result, expected);
});

// The same window, with B running agent X (run-chat stores its workspace)
// while the workspace record waits for its missing content: the run's own
// edit stays, A's memory too, and no default file conflicts.
test("review7 D2: agent X running on B before its workspace arrived keeps both devices' edits", async () => {
  const { a, b, x, server } = await agentWithMemory();
  const root = await decodeRoot(server.root!);
  const hash = root.records[`workspaces/${x.id}`].blob!;
  const blob = server.blobs.get(hash)!;
  server.blobs.delete(hash);
  await b.sync();
  assert.ok(b.get<Agent[]>(STORAGE_KEYS.agents).some((it) => it.id === x.id));
  assert.equal(files(b, x.id), undefined, "the workspace record waits");
  await onDevice(b, writeFile(x, "USER.md", BOB));
  server.blobs.set(hash, blob);
  const expected = [
    'MEMORY.md="# Memory\\n\\nUser likes tea.\\n"',
    'NOTES.md="# Notes\\n\\n"',
    'USER.md="# User\\n\\nCalled Bob.\\n"',
  ];
  for (const result of await settle(a, b, x.id))
    assert.deepEqual(result, expected);
});

const file = (path: string, content: string, updatedAt: number) => ({
  path,
  content,
  updatedAt,
});

test("files with equal content never get a conflict copy", () => {
  const mine = [file("a.md", "same", 1), file("b.md", "mine", 1)];
  const theirs = [file("a.md", "same", 2), file("b.md", "theirs", 2)];
  for (const base of [undefined, [file("a.md", "old", 0)]])
    assert.deepEqual(
      mergeFiles(base, mine, theirs, "theirs", "x").map((entry) => entry.path),
      ["a.md", "b.md", "b.conflict-x.md"],
    );
  // Saved again with the same text: unchanged, so the other side's edit wins.
  assert.deepEqual(
    mergeFiles(
      [file("a.md", "v1", 0)],
      [file("a.md", "v1", 5)],
      [file("a.md", "v2", 1)],
      "mine",
      "x",
    ),
    [file("a.md", "v2", 1)],
  );
});

test("two workspaces that never agreed merge from the default files", () => {
  const workspaces = syncCollection("workspaces")!;
  const md = (path: string, content: string, updatedAt: number) => ({
    ...file(path, content, updatedAt),
    kind: "markdown",
  });
  const defaults = (at: number) => [
    md("MEMORY.md", "# Memory\n\n", at),
    md("NOTES.md", "# Notes\n\n", at),
    md("USER.md", "# User\n\n", at),
  ];
  const real = [
    md("MEMORY.md", "# Memory\n\ntea\n", 1),
    md("USER.md", "# User\n\n", 1),
  ];
  const merged = workspaces.mergeBodies!(
    undefined,
    real,
    defaults(9),
    "theirs",
    "x",
  );
  // The untouched defaults (newer) lose to the real edits; NOTES.md, which
  // the real workspace removed, stays removed.
  assert.deepEqual(merged, [
    md("MEMORY.md", "# Memory\n\ntea\n", 1),
    md("USER.md", "# User\n\n", 9),
  ]);
  // Other collections keep every file without a base.
  const skills = syncCollection("skills")!;
  assert.equal(
    (skills.mergeBodies!(undefined, real, defaults(9), "theirs", "x") as [])
      .length,
    4,
  );
});
