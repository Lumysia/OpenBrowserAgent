import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { workspaceFiles } from "../src/background/workspace-tools";
import {
  createWorkspace,
  patchWorkspaceFile,
  upsertWorkspaceFile,
} from "../src/shared/workspace";
import { storage } from "../src/shared/storage";
import { installBrowser } from "./helpers";
import { manageMemory } from "../src/background/memory-tools";
import type { AgentWorkspace } from "../src/shared/types";
import { saveWorkspaceChanges } from "../src/shared/workspace-storage";

afterEach(() => mock.restoreAll());

for (const [patchOperation, value, expected] of [
  [undefined, "$& $$ $` $'", "$& $$ $` $'\n\n"],
  ["append", "tail", "# Notes\n\ntail"],
  ["prepend", "head", "head# Notes\n\n"],
] as const) {
  test(`advertised workspace patch dispatches ${patchOperation || "replace"} and persists literal text`, async () => {
    const workspace = createWorkspace("fixture");
    installBrowser();
    await storage.agentWorkspaces.set([workspace]);
    const result = await workspaceFiles(workspace, {
      operation: "patch",
      path: "NOTES.md",
      patchOperation,
      find: "# Notes",
      value,
    });
    assert.equal("patched" in result && result.patched, true);
    assert.equal(
      workspace.files.find((file) => file.path === "NOTES.md")?.content,
      expected,
    );
    assert.deepEqual((await storage.agentWorkspaces.get())[0], workspace);
  });
}

test("workspace replacement accepts an identical match and rejects missing text", () => {
  const workspace = createWorkspace("fixture");
  assert.equal(
    patchWorkspaceFile(workspace, "NOTES.md", "replace", "# Notes", "# Notes")
      .ok,
    true,
  );
  assert.equal(
    patchWorkspaceFile(
      workspace,
      "NOTES.md",
      "replace",
      "replacement",
      "missing",
    ).ok,
    false,
  );
});

function edited(workspace: AgentWorkspace, path: string, content: string) {
  const result = upsertWorkspaceFile(workspace, path, content);
  assert.ok(result.ok);
  return result.workspace;
}

for (const operation of [
  "write",
  "patch",
  "delete",
  "memory",
  "user",
] as const) {
  test(`${operation} uses current workspace and preserves newer unrelated files and memory`, async () => {
    installBrowser();
    const run = createWorkspace("fixture");
    const current = edited(
      edited(run, "later.md", "new file"),
      "MEMORY.md",
      "# Memory\n\n- [existing] newer memory\n",
    );
    await storage.agentWorkspaces.set([
      current,
      createWorkspace("other-agent"),
    ]);
    const result =
      operation === "memory" || operation === "user"
        ? await manageMemory(run, {
            operation: "add",
            scope: operation,
            text: "new entry",
          })
        : await workspaceFiles(run, {
            operation,
            path: "NOTES.md",
            find: "# Notes",
            value: "replacement",
            content: "replacement",
          });
    assert.ok(!("error" in result), JSON.stringify(result));
    const stored = await storage.agentWorkspaces.get();
    assert.equal(stored.length, 2);
    assert.equal(
      stored[0].files.find((file) => file.path === "later.md")?.content,
      "new file",
    );
    assert.match(
      stored[0].files.find((file) => file.path === "MEMORY.md")!.content,
      /newer memory/,
    );
    assert.deepEqual(run, stored[0]);
  });
}

for (const operation of ["write", "patch", "delete"] as const) {
  test(`${operation} rejects a changed same-file snapshot and refreshes the run`, async () => {
    installBrowser();
    const run = createWorkspace("fixture");
    const current = edited(run, "NOTES.md", "# Notes\n\nnewer content");
    await storage.agentWorkspaces.set([current]);
    const result = await workspaceFiles(run, {
      operation,
      path: "NOTES.md",
      find: "# Notes",
      value: "replacement",
      content: "replacement",
    });
    assert.ok("error" in result);
    assert.match(result.error!, /changed/);
    assert.deepEqual((await storage.agentWorkspaces.get())[0], current);
    assert.deepEqual(run, current);
  });
}

for (const scope of ["memory", "user"]) {
  test(`two independent runs serialize ${scope} additions and workspace patches`, async () => {
    installBrowser();
    const first = createWorkspace("fixture");
    const second = structuredClone(first);
    await storage.agentWorkspaces.set([first]);
    const results = await Promise.all([
      manageMemory(first, { operation: "add", scope, text: "first entry" }),
      manageMemory(second, { operation: "add", scope, text: "second entry" }),
      workspaceFiles(structuredClone(first), {
        operation: "patch",
        path: "NOTES.md",
        patchOperation: "append",
        value: "first patch",
      }),
      workspaceFiles(structuredClone(second), {
        operation: "patch",
        path: "NOTES.md",
        patchOperation: "append",
        value: "second patch",
      }),
    ]);
    assert.ok(results.every((result) => !("error" in result)));
    const stored = (await storage.agentWorkspaces.get())[0];
    const memory = stored.files.find(
      (file) => file.path === (scope === "memory" ? "MEMORY.md" : "USER.md"),
    )!.content;
    assert.match(memory, /first entry/);
    assert.match(memory, /second entry/);
    const notes = stored.files.find(
      (file) => file.path === "NOTES.md",
    )!.content;
    assert.match(notes, /first patchsecond patch/);
  });
}

for (const operation of ["update", "remove"]) {
  test(`memory ${operation} detects changed entry text without losing unrelated additions`, async () => {
    installBrowser();
    const run = edited(
      createWorkspace("fixture"),
      "MEMORY.md",
      "# Memory\n\n- [entry] original\n",
    );
    const current = edited(
      run,
      "MEMORY.md",
      "# Memory\n\n- [entry] newer\n- [later] keep\n",
    );
    await storage.agentWorkspaces.set([current]);
    const result = await manageMemory(run, {
      operation,
      id: "entry",
      text: "replacement",
    });
    assert.ok("error" in result);
    assert.match(result.error!, /changed/);
    assert.deepEqual((await storage.agentWorkspaces.get())[0], current);
  });
}

test("a settings draft and two agent runs preserve each other's unrelated changes", async () => {
  installBrowser();
  const original = createWorkspace("fixture");
  await storage.agentWorkspaces.set([original]);
  const draft = edited(original, "NOTES.md", "settings draft");
  const results = await Promise.all([
    manageMemory(structuredClone(original), {
      operation: "add",
      text: "memory from run one",
    }),
    saveWorkspaceChanges(structuredClone(original), draft),
    workspaceFiles(structuredClone(original), {
      operation: "write",
      path: "later.md",
      content: "file from run two",
    }),
  ]);
  assert.ok(results.every((result) => !("error" in result)));
  const stored = (await storage.agentWorkspaces.get())[0];
  assert.match(
    stored.files.find((file) => file.path === "MEMORY.md")!.content,
    /memory from run one/,
  );
  assert.equal(
    stored.files.find((file) => file.path === "NOTES.md")!.content,
    "settings draft",
  );
  assert.equal(
    stored.files.find((file) => file.path === "later.md")!.content,
    "file from run two",
  );
});

test("a settings rename validates the draft's original file before changing any paths", async () => {
  installBrowser();
  const original = edited(createWorkspace("fixture"), "custom.md", "original");
  const draft = edited(
    {
      ...original,
      files: original.files.filter((file) => file.path !== "custom.md"),
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

test("workspace patch keeps protected files unchanged", async () => {
  const workspace = createWorkspace("fixture");
  const before = structuredClone(workspace);
  const result = await workspaceFiles(workspace, {
    operation: "patch",
    path: "AGENTS.md",
    value: "override",
  });
  assert.ok("error" in result);
  assert.deepEqual(workspace, before);
});
