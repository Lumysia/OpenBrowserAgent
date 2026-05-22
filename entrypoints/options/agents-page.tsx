import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_ID,
  createAgentDraft,
  isBuiltinAgentId,
} from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { Agent, AgentWorkspace } from "../../src/shared/types";
import {
  createWorkspace,
  deleteWorkspaceFile,
  ensureAgentWorkspaces,
  isWorkspaceUserEditableFile,
  normalizeWorkspacePath,
  upsertWorkspaceFile,
  workspaceTotalChars,
} from "../../src/shared/workspace";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Input,
  Label,
  Textarea,
} from "../../src/ui/components";
import { AgentCapabilityEditor } from "./agent-capability-editor";
import { AgentIconPicker } from "./agent-icon-picker";
import { useStoredState } from "../../src/ui/useStoredState";
import { AgentIcon } from "../../src/ui/agent-icons";
import {
  agentDisplayDescription,
  agentDisplayName,
} from "../../src/ui/agent-display";
import { SkillFileActionButton } from "./skill-options-components";
import { downloadAgentZip, importAgentZip } from "./workspace-import";

export function AgentsPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents, setAgents] = useStoredState(storage.agents);
  const [workspaces, setWorkspaces] = useStoredState(storage.agentWorkspaces);
  const importAgentInputRef = useRef<HTMLInputElement | null>(null);
  const [importAgentError, setImportAgentError] = useState("");
  const t = getMessages(language);
  const items = agents || [];
  const selectedAgentId = preferences?.selectedAgentId || DEFAULT_AGENT_ID;

  useEffect(() => {
    if (!agents) return;
    const ensured = ensureAgentWorkspaces(agents, workspaces);
    if (ensured.changed) setWorkspaces(ensured.workspaces);
  }, [agents, workspaces, setWorkspaces]);

  function updateAgent(agentId: string, patch: Partial<Agent>) {
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId
          ? { ...agent, ...patch, updatedAt: Date.now() }
          : agent,
      ),
    );
  }

  function addAgent() {
    const agent = createAgentDraft(t.options.newAgent);
    setAgents((current) => [...current, agent]);
  }

  function deleteAgent(agentId: string) {
    if (isBuiltinAgentId(agentId)) return;
    setAgents((current) => current.filter((agent) => agent.id !== agentId));
    setWorkspaces((current) =>
      current.filter((workspace) => workspace.agentId !== agentId),
    );
    if (selectedAgentId === agentId)
      setPreferences((current) => ({
        ...current,
        selectedAgentId: DEFAULT_AGENT_ID,
      }));
  }

  function resetDefaultAgents() {
    const now = Date.now();
    setAgents(
      BUILTIN_AGENTS.map((agent) => ({
        ...agent,
        createdAt: now,
        updatedAt: now,
      })),
    );
    setWorkspaces(
      BUILTIN_AGENTS.map((agent) => createWorkspace(agent.id, now)),
    );
    setPreferences((current) => ({
      ...current,
      selectedAgentId: DEFAULT_AGENT_ID,
    }));
  }

  function workspaceForAgent(agentId: string) {
    return (
      workspaces?.find((workspace) => workspace.agentId === agentId) ||
      createWorkspace(agentId)
    );
  }

  async function importAgentPackage(file: File | undefined) {
    if (!file) return;
    try {
      const imported = await importAgentZip(file, {
        missingManifest: t.options.importAgentPackageMissingManifest,
        invalidManifest: t.options.importAgentPackageInvalidManifest,
      });
      setAgents((current) => [...current, imported.agent]);
      setWorkspaces((current) => [...(current || []), imported.workspace]);
      setPreferences((current) => ({
        ...current,
        selectedAgentId: imported.agent.id,
      }));
      setImportAgentError("");
    } catch (error) {
      setImportAgentError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (importAgentInputRef.current) importAgentInputRef.current.value = "";
    }
  }

  return (
    <div className="stack">
      <input
        ref={importAgentInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => importAgentPackage(event.currentTarget.files?.[0])}
      />
      <div className="settings-page-header">
        <div>
          <h1 className="settings-page-title">
            <AgentIcon size={24} /> {t.options.agents}
          </h1>
          <p className="muted">{t.options.agentsDescription}</p>
        </div>
        <div className="settings-page-actions">
          <Button
            variant="outline"
            onClick={() => importAgentInputRef.current?.click()}
          >
            <Upload size={15} /> {t.options.importAgentZip}
          </Button>
          <Button onClick={addAgent}>
            <Plus size={15} /> {t.options.newAgent}
          </Button>
        </div>
      </div>
      {importAgentError ? (
        <CardDescription>{importAgentError}</CardDescription>
      ) : null}
      <Accordion type="multiple" className="stack">
        {items.map((agent) => {
          const description = agentDisplayDescription(agent, t);
          const builtin = isBuiltinAgentId(agent.id);
          return (
            <AccordionItem key={agent.id} value={agent.id}>
              <AccordionTrigger>
                <span className="agent-summary">
                  <span className="agent-summary-title">
                    <AgentIcon agent={agent} size={18} />
                    <span>{agentDisplayName(agent, t)}</span>
                    <Badge>{agent.id}</Badge>
                  </span>
                  <small>
                    {description}
                    {builtin
                      ? `${description ? " · " : ""}${t.options.builtinAgentBadge}`
                      : ""}
                  </small>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="stack">
                  <Label>
                    {t.options.agentName}
                    <Input
                      value={builtin ? agentDisplayName(agent, t) : agent.name}
                      disabled={builtin}
                      onChange={(event) =>
                        updateAgent(agent.id, {
                          name: event.currentTarget.value,
                        })
                      }
                    />
                  </Label>
                  <Label>
                    {t.options.agentDescription}
                    <Input
                      value={builtin ? description : agent.description || ""}
                      disabled={builtin}
                      placeholder={t.options.defaultAgentSummary}
                      onChange={(event) =>
                        updateAgent(agent.id, {
                          description: event.currentTarget.value,
                        })
                      }
                    />
                  </Label>
                  {!builtin && (
                    <AgentIconPicker
                      t={t}
                      value={agent.icon}
                      onChange={(icon) => updateAgent(agent.id, { icon })}
                    />
                  )}
                  <AgentCapabilityEditor
                    t={t}
                    capabilities={agent.capabilities}
                    readOnly={builtin}
                    onChange={(capabilities) =>
                      updateAgent(agent.id, { capabilities })
                    }
                  />
                  {!builtin && (
                    <>
                      <AgentWorkspaceEditor
                        workspace={workspaceForAgent(agent.id)}
                        title={t.options.agentWorkspace}
                        description={t.options.agentWorkspaceDescription}
                        newFileLabel={t.options.agentWorkspaceNewFile}
                        newFilePlaceholder={
                          t.options.agentWorkspaceNewFilePlaceholder
                        }
                        emptyText={t.options.agentWorkspaceEmpty}
                        editLabel={t.common.edit}
                        saveLabel={t.common.save}
                        deleteLabel={t.common.delete}
                        onChange={(nextWorkspace) =>
                          setWorkspaces((current) => {
                            const others = (current || []).filter(
                              (workspace) => workspace.agentId !== agent.id,
                            );
                            return [...others, nextWorkspace];
                          })
                        }
                      />
                    </>
                  )}
                  <div className="row">
                    <Button
                      variant="outline"
                      onClick={() =>
                        downloadAgentZip(agent, workspaceForAgent(agent.id))
                      }
                    >
                      <Download size={15} /> {t.options.downloadAgentZip}
                    </Button>
                    <Button
                      variant="destructiveOutline"
                      disabled={builtin}
                      onClick={() => deleteAgent(agent.id)}
                    >
                      <Trash2 size={15} /> {t.options.deleteAgent}
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <Card>
        <CardContent>
          <div className="setting-switch-row">
            <div>
              <CardTitle className="settings-section-title">
                <RotateCcw size={18} /> {t.options.resetDefaultAgents}
              </CardTitle>
              <CardDescription>
                {t.options.resetDefaultAgentsDescription}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={resetDefaultAgents}>
              {t.options.resetDefaults}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentWorkspaceEditor({
  workspace,
  title,
  description,
  newFileLabel,
  newFilePlaceholder,
  emptyText,
  editLabel,
  saveLabel,
  deleteLabel,
  onChange,
}: {
  workspace: AgentWorkspace;
  title: string;
  description: string;
  newFileLabel: string;
  newFilePlaceholder: string;
  emptyText: string;
  editLabel: string;
  saveLabel: string;
  deleteLabel: string;
  onChange: (workspace: AgentWorkspace) => void;
}) {
  const [draftPath, setDraftPath] = useState("NOTES.md");
  const [editPath, setEditPath] = useState("");
  const [editFilePath, setEditFilePath] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [error, setError] = useState("");
  const editingFile = workspace.files.find((file) => file.path === editPath);

  function startEdit(path: string) {
    if (!isWorkspaceUserEditableFile(path)) return;
    const file = workspace.files.find((item) => item.path === path);
    setEditPath(editPath === path ? "" : path);
    setEditFilePath(file?.path || path);
    setDraftContent(file?.content || "");
    setError("");
  }

  function createFile() {
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
    onChange(result.workspace);
    setDraftPath("");
    setEditPath(path.path);
    setEditFilePath(path.path);
    setDraftContent("");
  }

  function saveFile() {
    if (!editingFile) return;
    if (!isWorkspaceUserEditableFile(editingFile.path)) return;
    const normalizedPath = normalizeWorkspacePath(editFilePath);
    if (!normalizedPath.ok) {
      setError(normalizedPath.error);
      return;
    }
    const filePath = normalizedPath.path;
    if (!isWorkspaceUserEditableFile(filePath)) return;
    const deleteResult =
      filePath === editingFile.path
        ? undefined
        : deleteWorkspaceFile(workspace, editingFile.path);
    const nextWorkspace = deleteResult?.ok ? deleteResult.workspace : workspace;
    const result = upsertWorkspaceFile(nextWorkspace, filePath, draftContent);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.workspace);
    setEditPath("");
    setEditFilePath(filePath);
    setError("");
  }

  function deleteFile(path: string) {
    if (!isWorkspaceUserEditableFile(path)) return;
    const result = deleteWorkspaceFile(workspace, path);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChange(result.workspace);
    if (editPath === path) setEditPath("");
    setError("");
  }

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="workspace">
        <AccordionTrigger>
          <span className="agent-summary">
            <span className="agent-summary-title">
              <FileText size={15} />
              <span>{title}</span>
            </span>
            <small>
              {workspace.files.length} files ·{" "}
              {workspaceTotalChars(workspace.files)} chars
            </small>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="stack">
            <CardDescription>{description}</CardDescription>
            <div className="option-add-file-row">
              <Input
                value={draftPath}
                aria-label={newFileLabel}
                placeholder={newFilePlaceholder}
                onChange={(event) => setDraftPath(event.currentTarget.value)}
              />
              <Button variant="outline" size="sm" onClick={createFile}>
                <Plus size={14} /> {newFileLabel}
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
                              label={editLabel}
                              onClick={() => startEdit(file.path)}
                            >
                              <Pencil size={14} />
                            </SkillFileActionButton>
                            <SkillFileActionButton
                              label={deleteLabel}
                              onClick={() => deleteFile(file.path)}
                            >
                              <Trash2 size={14} />
                            </SkillFileActionButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {editingFile?.path === file.path ? (
                      <div className="option-file-editor stack">
                        <Input
                          value={editFilePath}
                          onChange={(event) =>
                            setEditFilePath(event.currentTarget.value)
                          }
                        />
                        <Textarea
                          className="option-file-editor-textarea"
                          value={draftContent}
                          onChange={(event) =>
                            setDraftContent(event.currentTarget.value)
                          }
                        />
                        <div className="row">
                          <Button size="sm" onClick={saveFile}>
                            <Check size={14} /> {saveLabel}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <CardDescription>{emptyText}</CardDescription>
            )}
            {error ? <CardDescription>{error}</CardDescription> : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
