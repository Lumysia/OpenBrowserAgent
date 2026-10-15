import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AGENT_ID, resolveAgent } from "../src/shared/agents";
import { normalizeProviderState } from "../src/shared/provider-instances";
import { storeEdit } from "../src/shared/rebase";
import { storage } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type {
  Agent,
  AgentWorkspace,
  ProviderConfig,
  ProviderState,
} from "../src/shared/types";
import {
  deleteWorkspaceFile,
  WORKSPACE_FILE_PATH,
} from "../src/shared/workspace";
import {
  mutateWorkspace,
  storeAgentWorkspaces,
  workspaceForAgent,
} from "../src/shared/workspace-storage";
import { renameProviderDraft } from "../entrypoints/options/provider-drafts";
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
    await mutateWorkspace(workspace, (current) =>
      deleteWorkspaceFile(current, WORKSPACE_FILE_PATH.notes),
    );
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

// Saves the provider form of `providerId` with `edit` applied, the way the
// providers page stores it.
async function saveProviderForm(
  on: Device,
  providerId: string,
  edit: (draft: ProviderConfig) => ProviderConfig,
) {
  await onDevice(on, async () => {
    // The form edits the provider as the page lists it (normalized).
    const shown = await storage.provider.get();
    await storeEdit(storage.provider, shown, {
      ...shown,
      [providerId]: edit(normalizeProviderState(shown)[providerId]),
    });
  });
}

const modelIds = (on: Device, providerId: string) =>
  on
    .get<ProviderState>(PROVIDERS)
    [providerId]?.models?.map((model) => model.id);

test("fix7 P5: saving a provider leaves the models the user did not change as they are", async () => {
  const { clock, a, b } = pair();
  // Models stored before display names were kept, and one with its own.
  await a.set(PROVIDERS, {
    openai: {
      id: "openai",
      type: "openai",
      label: "Work / Team",
      apiKey: "k1",
      models: [
        { id: "openai:m1", name: "m1" },
        { id: "openai:m2", name: "m2", displayName: "Fast" },
        { id: "openai:m3", name: "m3", displayName: "Work / Team / m3" },
      ],
    },
  });
  await a.sync("edit");
  await b.sync();
  // A deletes two models.
  clock.now += 60_000;
  await saveProviderForm(a, "openai", (draft) => ({
    ...draft,
    models: draft.models!.filter((model) => model.id === "openai:m3"),
  }));
  await a.sync("edit");
  // B changes the API key before it syncs.
  clock.now += 60_000;
  await saveProviderForm(b, "openai", (draft) => ({ ...draft, apiKey: "k2" }));
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b]) {
    assert.deepEqual(modelIds(on, "openai"), ["openai:m3"], on.name);
    const provider = on.get<ProviderState>(PROVIDERS).openai;
    assert.equal(provider.apiKey, "k2", on.name);
    assert.equal(provider.models![0].displayName, "Work / Team / m3", on.name);
    // Defaults the page shows are not stored.
    assert.equal("baseUrl" in provider || "imageModels" in provider, false);
  }
});

test("fix7 P5: renaming a provider still renames its models", async () => {
  const { a } = pair();
  await a.set(PROVIDERS, {
    openai: {
      id: "openai",
      type: "openai",
      label: "Work",
      models: [
        { id: "openai:m1", name: "m1", displayName: "Work / Fast" },
        { id: "openai:m2", name: "m2", displayName: "Own name" },
      ],
    },
  });
  await saveProviderForm(a, "openai", (draft) =>
    renameProviderDraft(draft, "Work / Home"),
  );
  await saveProviderForm(a, "openai", (draft) =>
    renameProviderDraft(draft, "Home"),
  );
  assert.deepEqual(
    a
      .get<ProviderState>(PROVIDERS)
      .openai.models!.map((model) => model.displayName),
    ["Home / Fast", "Own name"],
  );
});

test("fix7 P5: saving one provider leaves the other providers as stored", async () => {
  const { clock, a, b } = pair();
  // `openrouter` was stored by an earlier version: no id, type or label.
  await a.set(PROVIDERS, {
    openai: { id: "openai", type: "openai", label: "OpenAI", models: [] },
    openrouter: { apiKey: "r1", models: [] },
  });
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  const { openrouter: _gone, ...kept } = a.get<ProviderState>(PROVIDERS);
  await a.set(PROVIDERS, kept);
  await a.sync("edit");
  clock.now += 60_000;
  await saveProviderForm(b, "openai", (draft) => ({ ...draft, apiKey: "k" }));
  await b.sync("edit");
  await a.sync();
  for (const on of [a, b])
    assert.deepEqual(
      Object.keys(on.get<ProviderState>(PROVIDERS)),
      ["openai"],
      on.name,
    );
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
    // Never stored: its defaults stay unstored.
    await storage.skillSettings.update((settings) => ({ ...settings }));
  });
  for (const [key, value] of Object.entries(stored))
    assert.deepEqual(a.get(key), value, key);
  assert.equal(STORAGE_KEYS.skillSettings in a.env.local.data, false);
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
