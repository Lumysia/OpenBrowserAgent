import type { AgentWorkspace } from "../../src/shared/types";

export type WorkspaceEditorDraft = {
  session: symbol;
  snapshot: AgentWorkspace;
  originalPath: string;
  path: string;
  content: string;
};

export function openWorkspaceDraft(
  workspace: AgentWorkspace,
  path: string,
): WorkspaceEditorDraft {
  return {
    session: Symbol(),
    snapshot: structuredClone(workspace),
    originalPath: path,
    path,
    content: workspace.files.find((file) => file.path === path)?.content || "",
  };
}

// A completion belongs to the draft that submitted it. Typing during that save
// remains open against the text we just committed; reopening/switching drafts
// establishes new ownership and must not be changed by an older completion.
export function completeWorkspaceDraftSave(
  current: WorkspaceEditorDraft | undefined,
  submitted: WorkspaceEditorDraft,
  workspace: AgentWorkspace,
  savedPath: string,
): WorkspaceEditorDraft | undefined {
  if (current === submitted) return undefined;
  if (
    current?.session !== submitted.session ||
    current.snapshot !== submitted.snapshot
  )
    return current;
  return {
    ...current,
    snapshot: structuredClone(workspace),
    originalPath: savedPath,
  };
}
