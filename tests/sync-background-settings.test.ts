import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AGENT_ID, resolveAgent } from "../src/shared/agents";
import { storeEdit } from "../src/shared/rebase";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { Agent, AgentWorkspace } from "../src/shared/types";
import { WORKSPACE_FILE_PATH } from "../src/shared/workspace";
import {
  saveWorkspaceChanges,
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

// Background rewrites of settings (the seventh fix): app paths that store
// providers, agents or workspaces the user did not change. Sync counts such
// a write as an edit made here, so what another device deleted comes back.

const WORKSPACES = STORAGE_KEYS.agentWorkspaces;
const PROVIDERS = STORAGE_KEYS.provider;

function pair() {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  return { clock, a, b };
}

const agent = (): Agent => resolveAgent(undefined, DEFAULT_AGENT_ID);
const paths = (on: Device) =>
  (on.get<AgentWorkspace[]>(WORKSPACES) ?? [])
    .find((workspace) => workspace.agentId === DEFAULT_AGENT_ID)
    ?.files.map((file) => file.path);

test("fix7 P4: a default workspace file the user deleted is not created again", async () => {
  const { clock, a, b } = pair();
  await onDevice(a, () => workspaceForAgent(agent(), true));
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await onDevice(a, async () => {
    const [workspace] = await storage.agentWorkspaces.get();
    await saveWorkspaceChanges(workspace, {
      ...workspace,
      files: workspace.files.filter(
        (file) => file.path !== WORKSPACE_FILE_PATH.notes,
      ),
    });
  });
  await a.sync("edit");
  await b.sync();
  // Runs of the agent and the agents page on both devices.
  clock.now += 60_000;
  for (const on of [b, a])
    await onDevice(on, async () => {
      await workspaceForAgent(agent(), true);
      await workspaceForAgent(agent(), false);
      await storeAgentWorkspaces([agent()]);
    });
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(
      paths(on),
      [WORKSPACE_FILE_PATH.memory, WORKSPACE_FILE_PATH.user],
      on.name,
    );
});

test("fix7 P4: an agent without a workspace still gets one with the default files", async () => {
  const { a } = pair();
  await onDevice(a, () => storeAgentWorkspaces([agent()]));
  assert.deepEqual(paths(a), [
    WORKSPACE_FILE_PATH.memory,
    WORKSPACE_FILE_PATH.notes,
    WORKSPACE_FILE_PATH.user,
  ]);
  const run = await onDevice(a, () =>
    workspaceForAgent({ ...agent(), id: "other" }, false),
  );
  assert.equal(run.files.length, 3);
});

test("fix7 guard: a store that changes nothing writes nothing", async () => {
  const { a } = pair();
  // Stored by an earlier version: normalizing on read changes them.
  const stored = {
    [STORAGE_KEYS.agents]: [{ id: "custom", name: " Mine " }],
    [WORKSPACES]: [
      {
        agentId: "custom",
        files: [
          { path: "b.md", content: "b" },
          { path: "a.md", content: "a" },
        ],
      },
    ],
    [STORAGE_KEYS.preferences]: { autoScroll: false },
  };
  for (const [key, value] of Object.entries(stored)) a.seed(key, value);
  await onDevice(a, async () => {
    await storage.agents.update((agents) => [...agents]);
    await storage.agentWorkspaces.update((workspaces) =>
      workspaces.map((workspace) => ({ ...workspace })),
    );
    await storage.preferences.update((preferences) => ({ ...preferences }));
  });
  for (const [key, value] of Object.entries(stored))
    assert.deepEqual(a.get(key), value, key);
});

test("fix7 guard: a list save keeps the stored form of the agents it did not change", async () => {
  const { clock, a, b } = pair();
  await a.set(STORAGE_KEYS.agents, [
    { id: "one", name: "One", prompt: "", toolGroups: [], createdAt: 1 },
    { id: "two", name: " Two ", createdAt: 2 },
  ]);
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  await a.set(STORAGE_KEYS.agents, [a.get<Agent[]>(STORAGE_KEYS.agents)[0]]);
  await a.sync("edit");
  // B renames agent one on its agents page.
  clock.now += 60_000;
  await onDevice(b, async () => {
    const shown = await storage.agents.get();
    await storeEdit(
      storage.agents,
      shown,
      shown.map((item) =>
        item.id === "one" ? { ...item, name: "Uno" } : item,
      ),
    );
  });
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b]) {
    const agents = on.get<Agent[]>(STORAGE_KEYS.agents);
    assert.equal(agents.find((item) => item.id === "one")?.name, "Uno");
    assert.equal(
      agents.some((item) => item.id === "two"),
      false,
      on.name,
    );
  }
});
