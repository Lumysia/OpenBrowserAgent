import { useState } from "react";
import { Check, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCount, type Messages } from "../../src/shared/i18n";
import type { AgentWorkspace } from "../../src/shared/types";
import {
  deleteWorkspaceFile,
  normalizeWorkspacePath,
  upsertWorkspaceFile,
  workspaceTotalChars,
  type WorkspaceMutationResult,
} from "../../src/shared/workspace";
import {
  mutateWorkspace,
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
  SettingsSummary,
} from "../../src/ui/components";
import { Feedback } from "../../src/ui/components/feedback";
import { SkillFileActionButton } from "./skill-options-components";

type Draft = {
  originalPath: string;
  path: string;
  content: string;
  // File text when editing started; a save is rejected if the stored file no
  // longer matches it (an agent run changed it meanwhile).
  baseContent: string;
};

export function AgentWorkspaceEditor({
  workspace,
  t,
}: {
  workspace: AgentWorkspace;
  t: Messages;
}) {
  const [newPath, setNewPath] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");

  const fileContent = (files: AgentWorkspace["files"], path: string) =>
    files.find((file) => file.path === path)?.content;

  function startEdit(path: string) {
    const content = fileContent(workspace.files, path);
    if (content === undefined) return;
    setDraft(
      draft?.originalPath === path
        ? undefined
        : { originalPath: path, path, content, baseContent: content },
    );
    setError("");
  }

  // Applies one change to the latest stored workspace so files written by a
  // running agent since this page loaded are kept.
  async function save(
    mutate: (current: AgentWorkspace) => WorkspaceMutationResult,
  ) {
    try {
      const result = await mutateWorkspace({ ...workspace }, mutate);
      setError(
        result.ok
          ? ""
          : result.error === WORKSPACE_FILE_CONFLICT
            ? t.options.agentWorkspaceConflict
            : result.error,
      );
      return result.ok;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function createFile() {
    const path = normalizeWorkspacePath(newPath);
    if (!path.ok) return setError(path.error);
    setNewPath("");
    // An existing path opens that file rather than replacing it with "".
    if (fileContent(workspace.files, path.path) !== undefined) {
      if (draft?.originalPath !== path.path) startEdit(path.path);
      return;
    }
    const created = await save((current) =>
      fileContent(current.files, path.path) === undefined
        ? upsertWorkspaceFile(current, path.path, "")
        : { ok: true, workspace: current },
    );
    if (created)
      setDraft({
        originalPath: path.path,
        path: path.path,
        content: "",
        baseContent: "",
      });
  }

  async function saveFile() {
    const submitted = draft;
    if (!submitted) return;
    const path = normalizeWorkspacePath(submitted.path);
    if (!path.ok) return setError(path.error);
    const saved = await save((current) => {
      if (
        fileContent(current.files, submitted.originalPath) !==
        submitted.baseContent
      )
        return { ok: false, error: WORKSPACE_FILE_CONFLICT };
      if (path.path !== submitted.originalPath) {
        const deleted = deleteWorkspaceFile(current, submitted.originalPath);
        if (!deleted.ok) return deleted;
        current = deleted.workspace;
      }
      return upsertWorkspaceFile(current, path.path, submitted.content);
    });
    if (!saved) return;
    // Close the editor unless the user kept typing while the save ran.
    setDraft((current) =>
      current === submitted
        ? undefined
        : current?.originalPath === submitted.originalPath
          ? {
              ...current,
              originalPath: path.path,
              baseContent: submitted.content,
            }
          : current,
    );
  }

  async function deleteFile(path: string) {
    const shown = fileContent(workspace.files, path);
    const deleted = await save((current) =>
      fileContent(current.files, path) === shown
        ? deleteWorkspaceFile(current, path)
        : { ok: false, error: WORKSPACE_FILE_CONFLICT },
    );
    if (deleted && draft?.originalPath === path) setDraft(undefined);
  }

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="workspace">
        <AccordionTrigger>
          <SettingsSummary
            icon={<FileText size={15} />}
            title={t.options.agentWorkspace}
            description={`${formatCount(t.display.counts.files, workspace.files.length)} · ${formatCount(t.display.counts.characters, workspaceTotalChars(workspace.files))}`}
          />
        </AccordionTrigger>
        <AccordionContent>
          <div className="stack">
            <CardDescription>
              {t.options.agentWorkspaceDescription}
            </CardDescription>
            <div className="option-add-file-row">
              <Input
                value={newPath}
                aria-label={t.options.agentWorkspaceNewFile}
                placeholder={t.options.agentWorkspaceNewFilePlaceholder}
                onChange={(event) => setNewPath(event.currentTarget.value)}
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
                        <span className="option-file-name ui-selectable">
                          {file.path}
                        </span>
                        <small>
                          {file.kind} · utf-8 ·{" "}
                          {formatCount(
                            t.display.counts.characters,
                            file.content.length,
                          )}
                        </small>
                      </span>
                      <div className="option-file-actions">
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
                      </div>
                    </div>
                    {draft?.originalPath === file.path ? (
                      <div className="option-file-editor stack">
                        <Input
                          value={draft.path}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              path: event.currentTarget.value,
                            })
                          }
                        />
                        <Textarea
                          className="option-file-editor-textarea"
                          value={draft.content}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              content: event.currentTarget.value,
                            })
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
            ) : null}
            {error ? <Feedback error>{error}</Feedback> : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
