import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  BUILTIN_MCP_SERVERS,
  createMcpServerDraft,
  isBuiltinMcpServer,
  normalizeMcpServer,
  normalizeMcpServers,
  type McpServerConfig,
} from "../src/shared/mcp";
import {
  MCP_ORIGIN_RULE_ID_BASE,
  MCP_ORIGIN_RULE_LIMIT,
  McpOriginRulesUnsupportedError,
  buildMcpOriginRules,
  mcpRequestUrl,
  prepareMcpRequest,
  syncMcpOriginRules,
} from "../src/shared/mcp-origin-rules";
import { STORAGE_KEYS } from "../src/shared/storage-keys";
import { keepStoredForm } from "../src/shared/stored-form";
import { eventListeners, memoryArea, swapChrome } from "./fake-chrome";

const host = "abcdefghijklmnopabcdefghijklmnop";
const server = (
  id: string,
  url: string,
  omitOrigin: boolean,
  enabled = false,
): McpServerConfig => ({
  ...createMcpServerDraft(id),
  id,
  url,
  omitOrigin,
  enabled,
});
const matches = (rule: { condition: { regexFilter?: string } }, url: string) =>
  new RegExp(rule.condition.regexFilter!).test(url);

test("only servers with the option on get a rule, enabled or not", () => {
  const rules = buildMcpOriginRules(
    [
      server("a", "https://a.example/mcp", true, true),
      server("b", "https://b.example/mcp", false, true),
      server("c", "https://c.example/mcp", true, false),
    ],
    host,
  );
  assert.equal(rules.length, 2);
  assert.ok(matches(rules[0], "https://a.example/mcp"));
  assert.ok(matches(rules[1], "https://c.example/mcp"));
  assert.ok(!rules.some((rule) => matches(rule, "https://b.example/mcp")));
});

test("a rule removes Origin from this extension's own requests to the exact URL", () => {
  const [rule] = buildMcpOriginRules(
    [server("a", "https://agent.tinyfish.ai/mcp", true)],
    host,
  );
  assert.deepEqual(rule.action, {
    type: "modifyHeaders",
    requestHeaders: [{ header: "origin", operation: "remove" }],
  });
  assert.deepEqual(rule.condition.initiatorDomains, [host]);
  assert.deepEqual(rule.condition.resourceTypes, ["xmlhttprequest"]);
  assert.equal(rule.condition.urlFilter, undefined);
  assert.ok(matches(rule, "https://agent.tinyfish.ai/mcp"));
  for (const other of [
    "https://agent.tinyfish.ai/mcp/other",
    "https://agent.tinyfish.ai/mcpx",
    "https://agent.tinyfish.ai/mcp?x=1",
    "https://agentXtinyfish.ai/mcp",
    "https://evil.example/https://agent.tinyfish.ai/mcp",
  ])
    assert.ok(!matches(rule, other), other);
});

test("rule URLs are the URL the browser requests: no fragment, special characters escaped", () => {
  assert.equal(mcpRequestUrl("https://a.example"), "https://a.example/");
  assert.equal(
    mcpRequestUrl("https://a.example/mcp#x"),
    "https://a.example/mcp",
  );
  assert.equal(mcpRequestUrl("ftp://a.example/"), "");
  assert.equal(mcpRequestUrl("not a url"), "");
  const [rule] = buildMcpOriginRules(
    [server("a", "https://a.example/m+c(p)?k=a.b*c", true)],
    host,
  );
  assert.ok(matches(rule, "https://a.example/m+c(p)?k=a.b*c"));
  assert.ok(!matches(rule, "https://a.example/mmc(p)?k=aXb*c"));
});

test("servers sharing a URL share one rule; invalid URLs get none; ids stay in range", () => {
  const rules = buildMcpOriginRules(
    [
      server("a", "https://a.example/mcp", true),
      server("b", "https://a.example/mcp#again", true),
      server("c", "", true),
      server("d", "javascript:alert(1)", true),
    ],
    host,
  );
  assert.equal(rules.length, 1);
  const many = buildMcpOriginRules(
    Array.from({ length: MCP_ORIGIN_RULE_LIMIT + 5 }, (_, index) =>
      server(`s${index}`, `https://s${index}.example/mcp`, true),
    ),
    host,
  );
  assert.equal(many.length, MCP_ORIGIN_RULE_LIMIT);
  assert.ok(
    many.every(
      (rule) =>
        rule.id >= MCP_ORIGIN_RULE_ID_BASE &&
        rule.id < MCP_ORIGIN_RULE_ID_BASE + MCP_ORIGIN_RULE_LIMIT,
    ),
  );
});

test("the TinyFish built-in sends requests without Origin; the other built-ins do not", () => {
  const byId = new Map(BUILTIN_MCP_SERVERS.map((item) => [item.id, item]));
  assert.equal(byId.get("builtin_tinyfish")?.omitOrigin, true);
  for (const id of ["builtin_exa", "builtin_parallel", "builtin_firecrawl"])
    assert.equal(byId.get(id)?.omitOrigin, false, id);
  const read = normalizeMcpServers(undefined);
  assert.equal(
    read.find((item) => item.id === "builtin_tinyfish")?.omitOrigin,
    true,
  );
});

test("a stored server without the field reads its default; an explicit value is kept", () => {
  const storedTinyFish = {
    id: "builtin_tinyfish",
    url: "https://agent.tinyfish.ai/mcp",
  };
  assert.equal(normalizeMcpServer(storedTinyFish)?.omitOrigin, true);
  assert.equal(
    normalizeMcpServer({ ...storedTinyFish, omitOrigin: false })?.omitOrigin,
    false,
  );
  assert.equal(
    normalizeMcpServer({ id: "mcp_x", url: "https://x.example/" })?.omitOrigin,
    false,
  );
  assert.equal(
    normalizeMcpServer({ id: "mcp_x", omitOrigin: true })?.omitOrigin,
    true,
  );
});

test("a save that leaves the option alone does not store the read default", () => {
  const stored = [{ id: "mcp_x", name: "X", url: "https://x.example/" }];
  const shown = normalizeMcpServers(stored);
  const next = shown.map((item) =>
    item.id === "mcp_x" ? { ...item, name: "Y" } : item,
  );
  const result = keepStoredForm(stored, shown, next) as Array<
    Record<string, unknown>
  >;
  const saved = result.find((item) => item.id === "mcp_x")!;
  assert.equal(saved.name, "Y");
  assert.ok(!("omitOrigin" in saved));
});

type Update = { removeRuleIds?: number[]; addRules?: unknown[] };
let restoreChrome = () => {};
afterEach(() => restoreChrome());

function fakeBrowser(stored: unknown[], dnr: boolean, updates: Update[] = []) {
  const local = memoryArea();
  local.data[STORAGE_KEYS.mcpServers] = stored;
  restoreChrome = swapChrome({
    runtime: { getURL: (path: string) => `chrome-extension://${host}${path}` },
    storage: { local, onChanged: eventListeners() },
    ...(dnr
      ? {
          declarativeNetRequest: {
            updateDynamicRules: async (update: Update) => {
              updates.push(update);
            },
          },
        }
      : {}),
  });
  return updates;
}

test("syncing replaces the whole rule id range in one update", async () => {
  const updates = fakeBrowser(
    [{ id: "mcp_a", url: "https://a.example/mcp", omitOrigin: true }],
    true,
  );
  assert.equal(
    await syncMcpOriginRules(server("draft", "https://draft.example/", true)),
    true,
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].removeRuleIds?.length, MCP_ORIGIN_RULE_LIMIT);
  assert.equal(updates[0].removeRuleIds?.[0], MCP_ORIGIN_RULE_ID_BASE);
  const rules = updates[0].addRules as Array<{
    condition: { regexFilter: string; initiatorDomains: string[] };
  }>;
  // Stored servers (with the TinyFish built-in filled in) and the draft.
  assert.deepEqual(
    rules.map((rule) => rule.condition.regexFilter),
    [
      "^https:\\/\\/agent\\.tinyfish\\.ai\\/mcp$",
      "^https:\\/\\/a\\.example\\/mcp$",
      "^https:\\/\\/draft\\.example\\/$",
    ],
  );
  assert.ok(rules.every((rule) => rule.condition.initiatorDomains[0] === host));
});

test("a request to a server with the option on fails clearly without the API", async () => {
  fakeBrowser([], false);
  await assert.rejects(
    prepareMcpRequest(server("a", "https://a.example/mcp", true)),
    McpOriginRulesUnsupportedError,
  );
  await prepareMcpRequest(server("b", "https://b.example/mcp", false));
});

test("built-in MCP servers come back after removal, so only custom ones are deletable", () => {
  const custom = {
    id: "mcp_custom",
    name: "Mine",
    url: "https://example.com/mcp",
  };
  const read = normalizeMcpServers([custom]);
  for (const builtin of BUILTIN_MCP_SERVERS) {
    assert.ok(read.some((server) => server.id === builtin.id));
    assert.equal(isBuiltinMcpServer(builtin.id), true);
  }
  assert.equal(isBuiltinMcpServer("mcp_custom"), false);
});
