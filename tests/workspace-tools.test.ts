import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { workspaceTool } from "../src/background/tools/workspace";
import type { ToolContext } from "../src/background/tools/types";
import { createWorkspace, upsertWorkspaceFile } from "../src/shared/workspace";
import { storage } from "../src/shared/storage";
import { installBrowser } from "./helpers";
import type { AgentWorkspace } from "../src/shared/types";
import { saveWorkspaceChanges } from "../src/shared/workspace-storage";

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
  installBrowser();
  const workspace = createWorkspace("fixture");
  await storage.agentWorkspaces.set([workspace]);
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
  installBrowser();
  const run = createWorkspace("fixture");
  const current = edited(
    edited(run, "later.md", "new file"),
    "MEMORY.md",
    "# Memory\n\n- newer\n",
  );
  await storage.agentWorkspaces.set([current, createWorkspace("other-agent")]);
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
  installBrowser();
  const run = createWorkspace("fixture");
  const current = edited(run, "NOTES.md", "# Notes\n\nnewer content");
  await storage.agentWorkspaces.set([current]);
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
  installBrowser();
  const original = createWorkspace("fixture");
  await storage.agentWorkspaces.set([original]);
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
    saveWorkspaceChanges(
      structuredClone(original),
      edited(original, "NOTES.md", "settings draft"),
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

test("a settings rename validates the draft's original file before changing any paths", async () => {
  installBrowser();
  const original = edited(createWorkspace("fixture"), "custom.md", "original");
  const draft = edited(
    {
      ...original,
      files: original.files.filter((item) => item.path !== "custom.md"),
    },
    "renamed.md",
    "edited",
  );
  const current = edited(original, "custom.md", "newer content");
  await storage.agentWorkspaces.set([current]);
  const result = await saveWorkspaceChanges(original, draft);
  assert.ok(!result.ok);
  assert.deepEqual((await storage.agentWorkspaces.get())[0], current);
});
