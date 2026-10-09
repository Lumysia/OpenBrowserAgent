import assert from "node:assert/strict";
import { test } from "node:test";
import {
  openWorkspaceDraft,
  completeWorkspaceDraftSave,
} from "../entrypoints/options/workspace-editor-draft";
import { createWorkspace, upsertWorkspaceFile } from "../src/shared/workspace";
import { saveWorkspaceChanges } from "../src/shared/workspace-storage";
import { storage } from "../src/shared/storage";
import { installBrowser } from "./helpers";
import type { AgentWorkspace } from "../src/shared/types";

function edit(workspace: AgentWorkspace, path: string, content: string) {
  const result = upsertWorkspaceFile(workspace, path, content);
  assert.equal(result.ok, true);
  return result.workspace;
}

test("typing during save retains text against the successfully committed baseline", async () => {
  installBrowser();
  const workspace = edit(createWorkspace("fixture"), "NOTES.md", "original");
  await storage.agentWorkspaces.set([workspace]);
  const submitted = {
    ...openWorkspaceDraft(workspace, "NOTES.md"),
    content: "first save",
  };
  const typing = { ...submitted, content: "new typing during save" };
  const saved = edit(workspace, "NOTES.md", submitted.content);
  await storage.agentWorkspaces.set([saved]);
  const remaining = completeWorkspaceDraftSave(
    typing,
    submitted,
    saved,
    "NOTES.md",
  )!;
  assert.equal(remaining.content, typing.content);
  const next = await saveWorkspaceChanges(
    remaining.snapshot,
    edit(remaining.snapshot, "NOTES.md", remaining.content),
  );
  assert.equal(next.ok, true);
  assert.equal(
    (await storage.agentWorkspaces.get())[0].files.find(
      (file) => file.path === "NOTES.md",
    )?.content,
    typing.content,
  );
});

test("an earlier save cannot close a reopened draft or advance its conflict baseline", () => {
  const workspace = edit(createWorkspace("fixture"), "NOTES.md", "original");
  const submitted = openWorkspaceDraft(workspace, "NOTES.md");
  const reopened = {
    ...openWorkspaceDraft(workspace, "NOTES.md"),
    content: "reopened draft",
  };
  const saved = edit(workspace, "NOTES.md", "older save completed");
  assert.equal(
    completeWorkspaceDraftSave(reopened, submitted, saved, "NOTES.md"),
    reopened,
  );
  assert.equal(
    reopened.snapshot.files.find((file) => file.path === "NOTES.md")?.content,
    "original",
  );
  assert.equal(
    completeWorkspaceDraftSave(undefined, submitted, saved, "NOTES.md"),
    undefined,
  );
});

test("an earlier completion cannot replace a newer committed baseline", () => {
  const workspace = createWorkspace("fixture");
  const submitted = openWorkspaceDraft(workspace, "NOTES.md");
  const newer = {
    ...submitted,
    content: "newest draft",
    snapshot: edit(workspace, "NOTES.md", "newest save"),
  };
  assert.equal(
    completeWorkspaceDraftSave(newer, submitted, workspace, "NOTES.md"),
    newer,
  );
});
