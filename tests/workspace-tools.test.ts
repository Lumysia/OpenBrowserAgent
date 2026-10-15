import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { workspaceTool } from "../src/background/tools/workspace";
import type { ToolContext } from "../src/background/tools/types";
import { createWorkspace, upsertWorkspaceFile } from "../src/shared/workspace";
import { storage } from "../src/shared/storage";
import { installChrome } from "./fake-chrome";
import type { AgentWorkspace } from "../src/shared/types";
import { mutateWorkspace } from "../src/shared/workspace-storage";

afterEach(() => mock.restoreAll());

const call = (workspace: AgentWorkspace, input: Record<string, unknown>) =>
  workspaceTool.execute(input, {
    run: { workspace },
  } as unknown as ToolContext);

function edited(workspace: AgentWorkspace, path: string, content: string) {
  const result = upsertWorkspaceFile(workspace, path, content);
  assert.ok(result.ok);
  return result.workspace;
}

const file = (workspace: AgentWorkspace, path: string) =>
  workspace.files.find((item) => item.path === path)?.content;

test("replace writes replacement text literally", async () => {
  installChrome();
  const workspace = createWorkspace("fixture");
  await storage.agentWorkspaces.replace([workspace]);
  const result = await call(workspace, {
    action: "replace",
    path: "NOTES.md",
    find: "# Notes",
    content: "$& $$ $` $'",
  });
  assert.equal(result.isError, undefined);
  assert.equal(
    file((await storage.agentWorkspaces.get())[0], "NOTES.md"),
    "$& $$ $` $'\n\n",
  );
});

test("a write applies to the current workspace and keeps newer unrelated files", async () => {
  installChrome();
  const run = createWorkspace("fixture");
  const current = edited(
    edited(run, "later.md", "new file"),
    "MEMORY.md",
    "# Memory\n\n- newer\n",
  );
  await storage.agentWorkspaces.replace([
    current,
    createWorkspace("other-agent"),
  ]);
  const result = await call(run, {
    action: "write",
    path: "NOTES.md",
    content: "replacement",
  });
  assert.equal(result.isError, undefined);
  const stored = await storage.agentWorkspaces.get();
  assert.equal(stored.length, 2);
  assert.equal(file(stored[0], "later.md"), "new file");
  assert.match(file(stored[0], "MEMORY.md")!, /newer/);
  assert.deepEqual(run, stored[0]);
});

test("replace rejects a file changed since the run read it, and refreshes the run", async () => {
  installChrome();
  const run = createWorkspace("fixture");
  const current = edited(run, "NOTES.md", "# Notes\n\nnewer content");
  await storage.agentWorkspaces.replace([current]);
  const result = await call(run, {
    action: "replace",
    path: "NOTES.md",
    find: "# Notes",
    content: "x",
  });
  assert.equal(result.isError, true);
  assert.match(result.text, /changed/);
  assert.deepEqual((await storage.agentWorkspaces.get())[0], current);
  assert.deepEqual(run, current);
});

test("memory appends from two runs and a settings draft keep each other's changes", async () => {
  installChrome();
  const original = createWorkspace("fixture");
  await storage.agentWorkspaces.replace([original]);
  const results = await Promise.all([
    call(structuredClone(original), {
      action: "append",
      path: "MEMORY.md",
      content: "- first entry",
    }),
    call(structuredClone(original), {
      action: "append",
      path: "MEMORY.md",
      content: "- second entry",
    }),
    mutateWorkspace(structuredClone(original), (current) =>
      upsertWorkspaceFile(current, "NOTES.md", "settings draft"),
    ),
    call(structuredClone(original), {
      action: "write",
      path: "later.md",
      content: "file from run",
    }),
  ]);
  assert.ok(
    results.every((result) => !("isError" in result && result.isError)),
  );
  const stored = (await storage.agentWorkspaces.get())[0];
  assert.match(file(stored, "MEMORY.md")!, /first entry/);
  assert.match(file(stored, "MEMORY.md")!, /second entry/);
  assert.equal(file(stored, "NOTES.md"), "settings draft");
  assert.equal(file(stored, "later.md"), "file from run");
});

test("write receipts say what changed", async () => {
  installChrome();
  const workspace = createWorkspace("fixture");
  await storage.agentWorkspaces.replace([workspace]);

  const created = await call(workspace, {
    action: "write",
    path: "a.md",
    content: "one two one",
  });
  assert.equal(created.text, "Created a.md (0 → 11 chars).");
  assert.deepEqual(created.details, {
    action: "write",
    path: "a.md",
    created: true,
    charsBefore: 0,
    charsAfter: 11,
  });

  const overwritten = await call(workspace, {
    action: "write",
    path: "a.md",
    content: "one two one one",
  });
  assert.equal(overwritten.text, "Overwrote a.md (11 → 15 chars).");
  assert.equal(overwritten.details?.created, false);

  const replaced = await call(workspace, {
    action: "replace",
    path: "a.md",
    find: "one",
    content: "three",
  });
  assert.equal(
    replaced.text,
    "Replaced the first of 3 occurrences of the find text in a.md (15 → 17 chars). The others are unchanged; replace again with more context to change them.",
  );
  assert.deepEqual(replaced.details, {
    action: "replace",
    path: "a.md",
    occurrences: 3,
    replaced: 1,
    charsBefore: 15,
    charsAfter: 17,
  });
  assert.equal(file(workspace, "a.md"), "three two one one");

  const appended = await call(workspace, {
    action: "append",
    path: "a.md",
    content: "four",
  });
  assert.equal(
    appended.text,
    "Appended 4 chars to a.md on a new line (a newline was added before the text) (17 → 22 chars).",
  );
  assert.equal(appended.details?.newlineAdded, true);
  const own = await call(workspace, {
    action: "append",
    path: "a.md",
    content: "\nfive",
  });
  assert.equal(own.details?.newlineAdded, false);
  assert.equal(file(workspace, "a.md"), "three two one one\nfour\nfive");

  const deleted = await call(workspace, { action: "delete", path: "a.md" });
  assert.equal(deleted.text, "Deleted a.md (27 chars).");
  assert.equal(deleted.details?.deleted, true);
});
