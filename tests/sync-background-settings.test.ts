import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AGENT_ID, resolveAgent } from "../src/shared/agents";
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
