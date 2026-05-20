import { useEffect, useState } from "react";
import { Bot, Check, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { DEFAULT_AGENT_ID, createAgentDraft } from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { Agent, AgentWorkspace } from "../../src/shared/types";
import {
  createWorkspace,
  deleteWorkspaceFile,
  ensureAgentWorkspaces,
  normalizeWorkspacePath,
  upsertWorkspaceFile,
  workspaceTotalChars,
} from "../../src/shared/workspace";
import {
  Button,
  CardDescription,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Input,
  Label,
  Textarea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { SkillFileActionButton } from "./skill-options-components";

export function AgentsPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents, setAgents] = useStoredState(storage.agents);
  const [workspaces, setWorkspaces] = useStoredState(storage.agentWorkspaces);
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
    if (agentId === DEFAULT_AGENT_ID) return;
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

  function agentDisplayName(agent: Agent) {
    return agent.id === DEFAULT_AGENT_ID ? t.words.agent : agent.name;
  }

  return (
    <div className="stack">
      <div className="setting-switch-row">
        <div>
          <h1 className="settings-page-title">
            <Bot size={24} /> {t.options.agents}
          </h1>
          <p className="muted">{t.options.agentsDescription}</p>
        </div>
        <Button onClick={addAgent}>
          <Plus size={15} /> {t.options.newAgent}
        </Button>
      </div>
      <Accordion type="multiple" className="stack">
        {items.map((agent) => {
          const description =
            agent.description || t.options.defaultAgentSummary;
          return (
            <AccordionItem key={agent.id} value={agent.id}>
              <AccordionTrigger>
                <span className="agent-summary">
                  <span className="agent-summary-title">
                    <Bot size={18} />
                    <span>{agentDisplayName(agent)}</span>
                  </span>
                  <small>{description}</small>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="stack">
                  <Label>
                    {t.options.agentName}
                    <Input
                      value={agent.name}
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
                      value={agent.description || ""}
                      placeholder={t.options.defaultAgentSummary}
                      onChange={(event) =>
                        updateAgent(agent.id, {
                          description: event.currentTarget.value,
                        })
                      }
                    />
                  </Label>
                  <AgentWorkspaceEditor
                    workspace={
                      workspaces?.find(
                        (workspace) => workspace.agentId === agent.id,
                      ) || createWorkspace(agent.id)
                    }
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
                  <div className="row">
                    <Button
                      variant="outline"
                      disabled={agent.id === DEFAULT_AGENT_ID}
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
    const normalizedPath = normalizeWorkspacePath(editFilePath);
    if (!normalizedPath.ok) {
      setError(normalizedPath.error);
      return;
    }
    const filePath = normalizedPath.path;
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
                        <strong>{file.path}</strong>
                        <small>
                          {file.kind} · utf-8 · {file.content.length} chars
                        </small>
                      </span>
                      <div className="option-file-actions">
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
