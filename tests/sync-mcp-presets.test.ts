import assert from "node:assert/strict";
import test from "node:test";
import { storage, updateById } from "../src/shared/storage";
import {
  findMcpServerPreset,
  mcpServerFromPreset,
} from "../src/shared/mcp-presets";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import type { McpServerConfig } from "../src/shared/mcp";
import { onDevice } from "./sync-app-fixture";
import { ALL_ON, device, memoryServer, memoryTransport } from "./sync-fixtures";

const MCP = STORAGE_KEYS.mcpServers;
const exaOf = (list: McpServerConfig[] | undefined) =>
  (list ?? []).find((server) => server.id === "builtin_exa");

const enableExa = (
  server: McpServerConfig = mcpServerFromPreset(
    findMcpServerPreset("builtin_exa")!,
  ),
): McpServerConfig => ({
  ...server,
  headers: { Authorization: "Bearer KEY" },
  tools: [{ name: "search", enabled: true }],
  testedAt: 5,
  enabled: true,
});

// An MCP server added from a preset and customised (B) vs. a device that stores the MCP list
// for an unrelated reason before it has downloaded that (A).
test("review7 B1: an unrelated MCP edit leaves another device's customised preset server as it is", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const a = device("deviceA", memoryTransport(server), clock, ALL_ON);
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  // Both start in sync with one custom server, stored as the app stores it.
  await onDevice(a, () =>
    storage.mcpServers.update((list) => [
      ...list.filter((s) => !s.id.startsWith("builtin_")),
      {
        id: "mcp_x",
        name: "x",
        url: "https://x",
        enabled: false,
        omitOrigin: false,
        headers: {},
        tools: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
  );
  await a.sync("edit");
  await b.sync();
  clock.now += 60_000;
  // B: user adds the exa preset, tests and enables it.
  await onDevice(b, () =>
    storage.mcpServers.update((list) => [...list, enableExa()]),
  );
  await b.sync("edit");
  clock.now += 10_000;
  // A: renames its custom server before its next round.
  await onDevice(a, () =>
    updateById(storage.mcpServers, "mcp_x", (s) => ({ ...s, name: "x2" })),
  );
  await a.sync("edit");
  await b.sync();
  await a.sync();
  for (const on of [a, b]) {
    const exa = exaOf(on.get(MCP));
    assert.equal(exa?.enabled, true, `${on.name}: exa enabled`);
    assert.deepEqual(exa?.headers, { Authorization: "Bearer KEY" });
  }
});

// New browser: the user adds one MCP server before turning sync on. Docs:
// it "keeps exactly those changes and takes the account's other settings".
test("review7 B1b: a new browser that adds one MCP server before joining keeps the account's servers", async () => {
  const clock = { now: 1_000_000_000 };
  const server = memoryServer();
  const b = device("deviceB", memoryTransport(server), clock, ALL_ON);
  await onDevice(b, () =>
    storage.mcpServers.update((list) => [...list, enableExa()]),
  );
  await b.sync("edit");
  clock.now += 3_600_000;
  const c = device("deviceC", memoryTransport(server), clock, ALL_ON);
  await onDevice(c, () =>
    storage.mcpServers.update((list) => [
      ...list,
      {
        id: "mcp_new",
        name: "new",
        url: "https://n",
        enabled: false,
        omitOrigin: false,
        headers: {},
        tools: [],
        createdAt: clock.now,
        updatedAt: clock.now,
      },
    ]),
  );
  // The list was never stored before: only the added server is.
  assert.deepEqual(
    c.get<McpServerConfig[]>(MCP).map((s) => s.id),
    ["mcp_new"],
  );
  await c.sync("manual");
  await b.sync();
  for (const on of [b, c]) {
    const exa = exaOf(on.get(MCP));
    assert.equal(exa?.enabled, true, `${on.name}: exa enabled`);
    assert.ok(
      on.get<McpServerConfig[]>(MCP).some((s) => s.id === "mcp_new"),
      `${on.name}: mcp_new kept`,
    );
  }
});
