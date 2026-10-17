import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { readTool } from "../src/background/tools/read";
import {
  TEXT_SEARCH_LIMITS,
  searchText,
} from "../src/background/tools/text-search";
import type { ToolContext } from "../src/background/tools/types";
import { createSkillPackage } from "../src/shared/skills";

afterEach(() => mock.restoreAll());

// A long log with a few matches far apart.
const LOG = Array.from({ length: 2000 }, (_, index) =>
  index % 500 === 7
    ? `line ${index}: ERROR Login failed for user owner`
    : `line ${index}: ok`,
).join("\n");

test("search returns each match's offset, context and the total", () => {
  const found = searchText("log", LOG, "login FAILED");
  assert.ok("text" in found);
  assert.equal(found.total, 4);
  const lines = found.text.split("\n");
  assert.match(
    lines[0],
    /^\[log \| 4 matches for "login FAILED" in \d+ characters\. To read around one, read with offset/,
  );
  const offset = LOG.indexOf("Login failed");
  assert.equal(lines[1].slice(0, `@${offset}:`.length), `@${offset}:`);
  assert.match(
    lines[1],
    /^@\d+: line 0: ok .*line 7: ERROR «Login failed» for user owner line 8: ok .*…$/,
  );
  // The offset reads straight at the match.
  assert.ok(LOG.slice(offset).startsWith("Login failed"));
});

test("search matches white space loosely, takes /regex/flags, caps and reports bad patterns", () => {
  const wrapped = searchText(
    "t",
    "Invalid\n  username or password",
    "invalid username",
  );
  assert.ok("total" in wrapped && wrapped.total === 1);
  const regex = searchText("log", LOG, "/line \\d+: ok$/m");
  assert.ok("text" in regex);
  assert.equal(regex.total, 1996);
  assert.equal(regex.text.split("\n").length, 1 + TEXT_SEARCH_LIMITS.matches);
  assert.match(
    regex.text,
    /showing the first 20, narrow the search for the rest/,
  );
  const none = searchText("log", LOG, "timeout");
  assert.ok("text" in none);
  assert.match(none.text, /0 matches for "timeout"/);
  assert.ok("error" in searchText("log", LOG, "/(/"));
  // Regex characters in plain text are literal.
  const literal = searchText("t", "a.b axb (c)", "a.b (c");
  assert.ok("total" in literal && literal.total === 0);
  assert.equal(
    (searchText("t", "a.b axb", "a.b") as { total: number }).total,
    1,
  );
});

const context = (run: Record<string, unknown>) =>
  ({ run, toolCallId: "call", progress() {} }) as unknown as ToolContext;

test("read searches stored outputs, workspace files, attachments, skills and URLs", async () => {
  const run = {
    agent: { toolGroups: ["pages", "browser"] },
    readArtifact: async (handle: string) =>
      handle === "art-1" ? { label: "runScript", text: LOG } : undefined,
    workspace: {
      agentId: "a",
      createdAt: 1,
      updatedAt: 1,
      files: [
        {
          path: "notes/log.txt",
          kind: "text",
          content: LOG,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    },
    attachments: [{ id: "f1", name: "log.txt", kind: "text", text: LOG }],
    skills: [
      createSkillPackage({
        name: "logs",
        description: "Logs",
        instruction: LOG,
      }),
    ],
  };
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(LOG, { headers: { "Content-Type": "text/plain" } }),
  );
  for (const source of [
    "art-1",
    "workspace:notes/log.txt",
    "attachment:f1",
    "skill:logs",
    "https://example.test/log.txt",
  ]) {
    const result = await readTool.execute(
      { source, search: "error login" },
      context(run),
    );
    assert.equal(result.isError, undefined, source);
    assert.match(result.text, /\| 4 matches for "error login"/, source);
    assert.equal(result.details?.matches, 4, source);
  }
  const bad = await readTool.execute(
    { source: "art-1", search: "/[/" },
    context(run),
  );
  assert.equal(bad.isError, true);
});
