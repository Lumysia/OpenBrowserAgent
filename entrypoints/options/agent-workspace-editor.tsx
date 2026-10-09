import { useRef, useState } from "react";
import { Check, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type { AgentWorkspace } from "../../src/shared/types";
import {
  deleteWorkspaceFile,
  isWorkspaceUserEditableFile,
  normalizeWorkspacePath,
  upsertWorkspaceFile,
  workspaceTotalChars,
} from "../../src/shared/workspace";
import {
  saveWorkspaceChanges,
  WORKSPACE_FILE_CONFLICT,
} from "../../src/shared/workspace-storage";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  CardDescription,
  Input,
  Textarea,
} from "../../src/ui/components";
import { SkillFileActionButton } from "./skill-options-components";
import {
  completeWorkspaceDraftSave,
  openWorkspaceDraft,
  type WorkspaceEditorDraft,
} from "./workspace-editor-draft";

export function AgentWorkspaceEditor({
  workspace,
  t,
}: {
  workspace: AgentWorkspace;
  t: Messages;
}) {
  const [draftPath, setDraftPath] = useState("NOTES.md");
  const [draft, setDraft] = useState<WorkspaceEditorDraft>();
  const [error, setError] = useState("");
  const currentDraft = useRef({ value: draft });

  function replaceDraft(next: WorkspaceEditorDraft | undefined) {
    if (currentDraft.current.value === next) return;
    currentDraft.current = { value: next };
    setDraft(next);
  }

  function updateDraft(
    patch: Partial<Pick<WorkspaceEditorDraft, "path" | "content">>,
  ) {
    if (currentDraft.current.value)
      replaceDraft({ ...currentDraft.current.value, ...patch });
  }

  function startEdit(path: string) {
    if (!isWorkspaceUserEditableFile(path)) return;
    replaceDraft(
      currentDraft.current.value?.originalPath === path
        ? undefined
        : openWorkspaceDraft(workspace, path),
    );
    setError("");
  }

  async function persist(
    previous: AgentWorkspace,
    next: AgentWorkspace,
    owner: typeof currentDraft.current,
  ) {
    try {
      const result = await saveWorkspaceChanges(
        structuredClone(previous),
        next,
      );
      if (!result.ok) {
        if (currentDraft.current === owner)
          setError(
            result.error === WORKSPACE_FILE_CONFLICT
              ? t.options.agentWorkspaceConflict
              : result.error,
          );
        return;
      }
      if (currentDraft.current === owner) setError("");
      return result.workspace;
    } catch (error) {
      if (currentDraft.current === owner)
        setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function createFile() {
    const owner = currentDraft.current;
    const path = normalizeWorkspacePath(draftPath);
    if (!path.ok) {
      setError(path.error);
      return;
    }
    if (!isWorkspaceUserEditableFile(path.path)) return;
    const result = upsertWorkspaceFile(workspace, path.path, "");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = await persist(workspace, result.workspace, owner);
    if (!saved) return;
    setDraftPath((current) => (current === draftPath ? "" : current));
    if (currentDraft.current === owner)
      replaceDraft(openWorkspaceDraft(saved, path.path));
  }

  async function saveFile() {
    const owner = currentDraft.current;
    const submitted = owner.value;
    if (!submitted) return;
    const previous = submitted.snapshot;
    const editingFile = previous.files.find(
      (file) => file.path === submitted.originalPath,
    );
    if (!editingFile || !isWorkspaceUserEditableFile(editingFile.path)) return;
    const normalizedPath = normalizeWorkspacePath(submitted.path);
    if (!normalizedPath.ok) {
      setError(normalizedPath.error);
      return;
    }
    const filePath = normalizedPath.path;
    if (!isWorkspaceUserEditableFile(filePath)) return;
    const deletion =
      filePath === editingFile.path
        ? undefined
        : deleteWorkspaceFile(previous, editingFile.path);
    const result = upsertWorkspaceFile(
      deletion?.ok ? deletion.workspace : previous,
      filePath,
      submitted.content,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = await persist(previous, result.workspace, owner);
    if (saved)
      replaceDraft(
        completeWorkspaceDraftSave(
          currentDraft.current.value,
          submitted,
          saved,
          filePath,
        ),
      );
  }

  async function deleteFile(path: string) {
    const owner = currentDraft.current;
    if (!isWorkspaceUserEditableFile(path)) return;
    const result = deleteWorkspaceFile(workspace, path);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!(await persist(workspace, result.workspace, owner))) return;
    if (currentDraft.current === owner && owner.value?.originalPath === path)
      replaceDraft(undefined);
  }

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="workspace">
        <AccordionTrigger>
          <span className="settings-summary">
            <span className="settings-summary-title">
              <FileText size={15} />
              <span>{t.options.agentWorkspace}</span>
            </span>
            <small>
              {workspace.files.length} files ·{" "}
              {workspaceTotalChars(workspace.files)} chars
            </small>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="stack">
            <CardDescription>
              {t.options.agentWorkspaceDescription}
            </CardDescription>
            <div className="option-add-file-row">
              <Input
                value={draftPath}
                aria-label={t.options.agentWorkspaceNewFile}
                placeholder={t.options.agentWorkspaceNewFilePlaceholder}
                onChange={(event) => setDraftPath(event.currentTarget.value)}
              />
              <Button variant="outline" size="sm" onClick={createFile}>
                <Plus size={14} />
                {t.options.agentWorkspaceNewFile}
              </Button>
            </div>
            {workspace.files.length ? (
              <div className="option-file-list">
                {workspace.files.map((file) => (
                  <div className="option-file-block" key={file.path}>
                    <div className="option-file-item">
                      <FileText size={18} />
                      <span>
                        <span className="option-file-name">{file.path}</span>
                        <small>
                          {file.kind} · utf-8 · {file.content.length} chars
                        </small>
                      </span>
                      <div className="option-file-actions">
                        {isWorkspaceUserEditableFile(file.path) ? (
                          <>
                            <SkillFileActionButton
                              label={t.common.edit}
                              onClick={() => startEdit(file.path)}
                            >
                              <Pencil size={14} />
                            </SkillFileActionButton>
                            <SkillFileActionButton
                              label={t.common.delete}
                              onClick={() => deleteFile(file.path)}
                            >
                              <Trash2 size={14} />
                            </SkillFileActionButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {draft?.originalPath === file.path ? (
                      <div className="option-file-editor stack">
                        <Input
                          value={draft.path}
                          onChange={(event) =>
                            updateDraft({ path: event.currentTarget.value })
                          }
                        />
                        <Textarea
                          className="option-file-editor-textarea"
                          value={draft.content}
                          onChange={(event) =>
                            updateDraft({ content: event.currentTarget.value })
                          }
                        />
                        <div className="row">
                          <Button size="sm" onClick={saveFile}>
                            <Check size={14} />
                            {t.common.save}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <CardDescription>{t.options.agentWorkspaceEmpty}</CardDescription>
            )}
            {error ? <CardDescription>{error}</CardDescription> : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
