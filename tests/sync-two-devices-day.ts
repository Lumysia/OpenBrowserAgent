// A scripted day of use on two devices, against a server that ignores
// If-Match when the suite has one (a write may then replace another): chats
// continued, regenerated and deleted on either device, settings edited at
// once, a device closed with unsent edits for two days, a lost root-write
// answer, a long reply, a provider rename, built-in MCP servers and default
// workspaces. Both devices must end with the same, expected data.
import assert from "node:assert/strict";
import { renameProviderDraft } from "../entrypoints/options/provider-drafts";
import { loadContent } from "../src/background/sync/service";
import { createAgentDraft, DEFAULT_AGENT_ID } from "../src/shared/agents";
import { deleteChats, saveChatContent } from "../src/shared/chat-storage";
import { createMcpServerDraft, type McpServerConfig } from "../src/shared/mcp";
import { storage, updateById } from "../src/shared/storage";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { createWebDavTransport } from "../src/shared/sync/webdav";
import type { Agent, AgentWorkspace, ChatContent } from "../src/shared/types";
import { upsertWorkspaceFile } from "../src/shared/workspace";
import {
  mutateWorkspace,
  storeAgentWorkspaces,
  workspaceForAgent,
} from "../src/shared/workspace-storage";
import { onDevice, reply, storeChat, userMessage } from "./sync-app-fixture";
import { ALL_ON, device, type Device } from "./sync-fixtures";
import {
  CHATS,
  folder,
  loggingFetch,
  saveChat,
  tick,
  type FailingFetch,
} from "./sync-two-devices-helpers";

const DAY = 24 * 60 * 60_000;
const PREFS = STORAGE_KEYS.preferences;
const PROVIDER = STORAGE_KEYS.provider;
const MCP = STORAGE_KEYS.mcpServers;
const WORKSPACES = STORAGE_KEYS.agentWorkspaces;
type Msg = [string, number];
type Provider = {
  label: string;
  models: Array<{ id: string; displayName: string }>;
};

export function dayOfUseCases(baseA: string, baseB: string) {
  return { "a day of use: both devices end with the same data": dayOfUse };

  async function dayOfUse() {
    // a's next root PUT lands and its answer is lost.
    const losing = { armed: false };
    const failA: FailingFetch = {
      loseAnswer: (method, path) => {
        if (!losing.armed || method !== "PUT" || path !== "root.json.gz")
          return false;
        losing.armed = false;
        return true;
      },
    };
    let offset = 0;
    const clock = {
      get now() {
        return Date.now() + offset;
      },
    };
    const urlA = await folder(baseA, "day");
    const urlB = await folder(baseB, "day");
    const a = device(
      "deviceA",
      createWebDavTransport({ url: urlA }, loggingFetch("A", failA)),
      clock,
      ALL_ON,
    );
    const b = device(
      "deviceB",
      createWebDavTransport({ url: urlB }, loggingFetch("B")),
      clock,
      ALL_ON,
    );

    async function sync(on: Device, reason: "edit" | "poll" = "poll") {
      for (let i = 0; i < 5; i++) {
        try {
          const result = await on.sync(reason);
          await tick();
          return result;
        } catch {
          await tick();
        }
      }
      throw new Error(`${on.name}: rounds keep failing`);
    }
    // At once: on a server that ignores If-Match, one write may replace
    // the other.
    const both = () => Promise.all([sync(a), sync(b)]);
    const twice = async () => {
      await both();
      await both();
    };
    async function openAll(on: Device) {
      for (const { id } of on.get<Array<{ id: string }>>(CHATS) ?? [])
        await loadContent(on.context, "chats", id);
      await on.settle();
    }
    const local = (on: Device, id: string): Msg[] =>
      (
        on.get<{ messages: Array<{ id: string; createdAt: number }> }>(
          `${CHATS}/${id}`,
        )?.messages ?? []
      ).map((m) => [m.id, m.createdAt]);
    const add = (on: Device, id: string, ...msgs: string[]) =>
      saveChat(on, id, [
        ...local(on, id),
        ...msgs.map((msg): Msg => [msg, clock.now]),
      ]);
    const replaceLast = (on: Device, id: string, msg: string) =>
      saveChat(on, id, [...local(on, id).slice(0, -1), [msg, clock.now]]);

    // Morning: the laptop (a) starts two chats and sets things up.
    await a.set(PREFS, { theme: "light", fontSize: 14 });
    await a.set(PROVIDER, {
      openai: { apiKey: "k1", model: "gpt-a" },
      anthropic: { apiKey: "k2", model: "claude-a" },
      proxy: {
        type: "openai",
        label: "Proxy",
        apiKey: "k3",
        models: [{ id: "p1", name: "p1", displayName: "Proxy / p1" }],
      },
    });
    await add(a, "c1", "u1", "r1");
    await add(a, "c2", "u1", "r1");
    // Both run the default agent before b first syncs: each creates its
    // workspace.
    const defaultAgent = { id: DEFAULT_AGENT_ID } as Agent;
    await onDevice(a, () => workspaceForAgent(defaultAgent, true));
    await onDevice(b, () => workspaceForAgent(defaultAgent, true));
    await sync(a, "edit");
    await sync(b, "edit");
    await openAll(b);

    // The desktop (b) continues c1; the laptop regenerates c2's reply.
    await add(b, "c1", "u2", "r2");
    await replaceLast(a, "c2", "r1-regen");
    await b.set(PROVIDER, {
      ...b.get<object>(PROVIDER),
      openai: { apiKey: "k1", model: "gpt-b" },
    });
    await a.set(PREFS, { ...a.get<object>(PREFS), theme: "dark" });
    await twice();
    await openAll(a);
    await openAll(b);

    // Midday: a third chat on b, a reply on a, both edit settings at once.
    await add(b, "c3", "u1", "r1");
    await add(a, "c1", "u3", "r3");
    await a.set(PROVIDER, {
      ...a.get<object>(PROVIDER),
      anthropic: { apiKey: "k2", model: "claude-a2" },
    });
    await b.set(PREFS, { ...b.get<object>(PREFS), fontSize: 16 });
    await twice();
    await openAll(a);
    await openAll(b);

    // Evening: b is closed with edits not uploaded yet.
    await replaceLast(b, "c3", "r1-regen");
    await b.set(PREFS, { ...b.get<object>(PREFS), fontSize: 18 });
    // Two days pass; a keeps working (the server collects old blobs).
    for (let day = 0; day < 2; day++) {
      offset += DAY / 2;
      await add(a, "c2", `u${day + 2}`, `r${day + 2}`);
      await sync(a, "edit");
      offset += DAY / 2;
      await a.set(PREFS, {
        ...a.get<object>(PREFS),
        theme: day ? "dark" : "sepia",
      });
      await sync(a, "edit");
      await sync(a);
    }
    // b reopens.
    await sync(b);
    await openAll(b);
    await twice();
    await openAll(a);
    await openAll(b);

    // A root write on a whose answer is lost, then a regenerates.
    await add(a, "c1", "u4", "r4");
    losing.armed = true;
    await sync(a, "edit");
    await replaceLast(a, "c1", "r4-regen");
    await sync(a, "edit");
    await sync(b);
    await openAll(b);

    // A long reply streams on a while b edits another chat.
    const streaming = new Set<string>();
    a.env.runActive = (id: string) => streaming.has(id);
    const t0 = clock.now;
    await storeChat(a, "c4", { messages: [userMessage("q1", t0)] });
    await sync(a, "edit");
    await sync(b);
    await openAll(b);
    streaming.add("c4");
    for (let i = 1; i <= 3; i++) {
      await storeChat(a, "c4", {
        messages: [
          userMessage("q1", t0),
          reply("s1", t0 + 1, "part".repeat(i)),
        ],
      });
      await add(b, "c2", `b-stream-${i}`);
      await both();
      await openAll(b);
      assert.deepEqual(
        local(b, "c4").map(([id]) => id),
        ["q1"],
        "streaming",
      );
    }
    streaming.delete("c4");
    await storeChat(a, "c4", {
      messages: [userMessage("q1", t0), reply("s1", t0 + 1, "answer", t0 + 5)],
    });
    await twice();
    await openAll(b);

    // a renames a provider while b adds a model to it.
    await onDevice(a, () =>
      storage.provider.update((state) => ({
        ...state,
        proxy: renameProviderDraft(state.proxy, "Gateway"),
      })),
    );
    await onDevice(b, () =>
      storage.provider.update((state) => ({
        ...state,
        proxy: {
          ...state.proxy,
          models: [
            ...(state.proxy.models ?? []),
            { id: "p2", name: "p2", displayName: "Proxy / p2" },
          ],
        },
      })),
    );
    await twice();

    // a deletes c3 while b has it open; b's panel saves its copy again.
    await openAll(b);
    const copy = structuredClone(b.get<ChatContent>(`${CHATS}/c3`));
    await onDevice(a, () => deleteChats(["c3"]));
    await sync(a, "edit");
    await sync(b);
    if (b.get(`${CHATS}/c3`) !== undefined)
      await onDevice(b, () => saveChatContent("c3", copy, copy));
    await twice();

    // a sets up a built-in MCP server; b, before its next round, adds one
    // of its own (neither had stored the list).
    await onDevice(a, () =>
      updateById(storage.mcpServers, "builtin_exa", (server) => ({
        ...server,
        headers: { Authorization: "Bearer KEY" },
        tools: [{ name: "search", enabled: true }],
        testedAt: clock.now,
        enabled: true,
      })),
    );
    await sync(a, "edit");
    await onDevice(b, () =>
      storage.mcpServers.update((list) => [
        ...list,
        { ...createMcpServerDraft("b"), id: "mcp_b", url: "https://b" },
      ]),
    );
    // a's new agent remembers something; b has the agents page open,
    // which creates a workspace for it as soon as the agent arrives.
    const x = createAgentDraft("X");
    await onDevice(a, async () => {
      await storage.agents.update((list) => [...list, x]);
      const workspace = await workspaceForAgent(x, true);
      await mutateWorkspace(workspace, (current) =>
        upsertWorkspaceFile(current, "MEMORY.md", "# Memory\n\ntea\n"),
      );
    });
    let page: Promise<unknown> | undefined;
    b.env.local.listeners.push((changes) => {
      if (changes[STORAGE_KEYS.agents] && !page)
        page = onDevice(b, async () =>
          storeAgentWorkspaces(await storage.agents.get()),
        );
    });
    await sync(a, "edit");
    await sync(b, "edit");
    await page;
    await twice();
    await openAll(a);
    await openAll(b);
    await both();

    const [sa, sb] = [snapshot(a), snapshot(b)];
    assert.deepEqual(sa, sb, "final states differ");
    assert.deepEqual(sa.chats, {
      c1: ["u1", "r1", "u2", "r2", "u3", "r3", "u4", "r4-regen"],
      c2: [
        ...["u1", "r1-regen", "u2", "r2", "u3", "r3"],
        ...["b-stream-1", "b-stream-2", "b-stream-3"],
      ],
      c4: ["q1", "s1"],
    });
    const proxy = (sa.provider as Record<string, Provider>).proxy;
    assert.equal(proxy.label, "Gateway");
    assert.deepEqual(
      proxy.models.map((model) => [model.id, model.displayName]),
      [
        ["p1", "Gateway / p1"],
        ["p2", "Proxy / p2"],
      ],
    );
    assert.deepEqual(sa.prefs, { theme: "dark", fontSize: 18 });
    const exa = sa.mcp.find((server) => server.id === "builtin_exa");
    assert.equal(exa?.enabled, true, "a's built-in setup stays");
    assert.ok(sa.mcp.some((server) => server.id === "mcp_b"));
    for (const agentId of [DEFAULT_AGENT_ID, x.id])
      assert.deepEqual(
        sa.workspaces[agentId],
        ["MEMORY.md", "NOTES.md", "USER.md"],
        agentId,
      );
    const memory = a
      .get<AgentWorkspace[]>(WORKSPACES)
      .find((workspace) => workspace.agentId === x.id)
      ?.files.find((file) => file.path === "MEMORY.md");
    assert.equal(memory?.content, "# Memory\n\ntea\n");
  }
}

// As browser storage holds it (fields set to undefined are not stored).
function snapshot(on: Device) {
  const list = (on.get<Array<{ id: string }>>(CHATS) ?? [])
    .map((item) => item.id)
    .sort();
  return JSON.parse(
    JSON.stringify({
      chats: Object.fromEntries(
        list.map((id) => [
          id,
          (
            on.get<{ messages: Array<{ id: string }> }>(`${CHATS}/${id}`)
              ?.messages ?? []
          ).map((m) => m.id),
        ]),
      ),
      prefs: on.get(PREFS),
      provider: on.get(PROVIDER),
      mcp: on.get<McpServerConfig[]>(MCP) ?? [],
      workspaces: Object.fromEntries(
        (on.get<AgentWorkspace[]>(WORKSPACES) ?? []).map((workspace) => [
          workspace.agentId,
          workspace.files.map((file) => file.path).sort(),
        ]),
      ),
    }),
  ) as {
    chats: Record<string, string[]>;
    prefs: unknown;
    provider: unknown;
    mcp: McpServerConfig[];
    workspaces: Record<string, string[]>;
  };
}
