import { useEffect, useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_ID,
  createAgentDraft,
  isBuiltinAgentId,
} from "../../src/shared/agents";
import { storage } from "../../src/shared/storage";
import { allowAgentHere } from "../../src/shared/tasks/edit";
import type { Agent } from "../../src/shared/types";
import { createWorkspace } from "../../src/shared/workspace";
import { storeAgentWorkspaces } from "../../src/shared/workspace-storage";
import {
  Button,
  Feedback,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Label,
  SettingsSummary,
  SettingsPageHeader,
  CommitInput,
  CommitTextarea,
  ConfirmButton,
} from "../../src/ui/components";
import { AgentToolsEditor } from "./agent-tools-editor";
import { ResetDefaultsCard } from "./reset-defaults-card";
import { ModelSelect, useConfiguredModels } from "./model-select";
import { AgentIconPicker } from "./agent-icon-picker";
import { useStoredState } from "../../src/ui/useStoredState";
import { AgentIcon } from "../../src/ui/agent-icons";
import {
  agentDisplayDescription,
  agentDisplayName,
} from "../../src/ui/agent-display";
import { AgentWorkspaceEditor } from "./agent-workspace-editor";
import { downloadAgentZip, importAgentZip } from "./workspace-import";
import { importErrorText } from "./import-errors";
import { useLatest } from "../../src/ui/use-latest";
import { useMessages } from "../../src/ui/messages";
import { revealElement } from "../../src/ui/reveal";

const agentElementId = (agentId: string) => `agent-${agentId}`;

export function AgentsPage() {
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents, setAgents] = useStoredState(storage.agents);
  const [workspaces] = useStoredState(storage.agentWorkspaces);
  const importAgentInputRef = useRef<HTMLInputElement | null>(null);
  const [importAgentError, setImportAgentError] = useState("");
  const [openAgents, setOpenAgents] = useState<string[]>([]);
  const t = useMessages();
  const models = useConfiguredModels();
  const items = agents || [];
  const selectedAgentId = preferences?.selectedAgentId || DEFAULT_AGENT_ID;

  // Agents added here or synced from another device get a stored workspace
  // (the editor writes into it). Only a new or removed agent needs a check.
  const agentIds = items.map((agent) => agent.id).join("\n");
  const agentsRef = useLatest(items);
  useEffect(() => {
    if (agentIds) storeAgentWorkspaces(agentsRef.current).catch(console.warn);
  }, [agentIds, agentsRef]);

  function updateAgent(agentId: string, patch: Partial<Agent>) {
    // Tools or acting set here are allowed here (tasks/approval.ts).
    const edited = items.find((agent) => agent.id === agentId);
    if (edited && ("toolGroups" in patch || "actUnattended" in patch))
      allowAgentHere({ ...edited, ...patch }).catch(console.warn);
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
    setOpenAgents((current) => [...current, agent.id]);
    revealElement(agentElementId(agent.id));
  }

  function deleteAgent(agentId: string) {
    if (isBuiltinAgentId(agentId)) return;
    setAgents((current) => current.filter((agent) => agent.id !== agentId));
    storage.agentWorkspaces
      .update((current) =>
        current.filter((workspace) => workspace.agentId !== agentId),
      )
      .catch(console.warn);
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
    // Resetting replaces every workspace on purpose.
    storage.agentWorkspaces
      .replace(BUILTIN_AGENTS.map((agent) => createWorkspace(agent.id, now)))
      .catch(console.warn);
    setPreferences((current) => ({
      ...current,
      selectedAgentId: DEFAULT_AGENT_ID,
    }));
  }

  function resetBuiltinAgents() {
    const now = Date.now();
    const builtinIds = new Set(BUILTIN_AGENTS.map((agent) => agent.id));
    setAgents((current) => [
      ...BUILTIN_AGENTS.map((agent) => ({
        ...agent,
        createdAt: now,
        updatedAt: now,
      })),
      ...current.filter((agent) => !builtinIds.has(agent.id) && !agent.builtin),
    ]);
    storage.agentWorkspaces
      .update((current) => [
        ...BUILTIN_AGENTS.map((agent) => createWorkspace(agent.id, now)),
        ...(current || []).filter(
          (workspace) => !builtinIds.has(workspace.agentId),
        ),
      ])
      .catch(console.warn);
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
      const imported = await importAgentZip(file);
      setAgents((current) => [...current, imported.agent]);
      await storage.agentWorkspaces.update((current) => [
        ...current,
        imported.workspace,
      ]);
      setPreferences((current) => ({
        ...current,
        selectedAgentId: imported.agent.id,
      }));
      setImportAgentError("");
    } catch (error) {
      setImportAgentError(
        importErrorText(t.options.importAgentError, error, t),
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
      <SettingsPageHeader
        icon={<AgentIcon />}
        title={t.options.agents}
        description={t.options.agentsDescription}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => importAgentInputRef.current?.click()}
            >
              <Upload size={15} /> {t.options.importAgentZip}
            </Button>
            <Button onClick={addAgent}>
              <Plus size={15} /> {t.options.newAgent}
            </Button>
          </>
        }
      />
      {importAgentError ? <Feedback error>{importAgentError}</Feedback> : null}
      <Accordion
        type="multiple"
        value={openAgents}
        onValueChange={setOpenAgents}
        className="stack"
      >
        {items.map((agent) => {
          const description = agentDisplayDescription(agent, t);
          const builtin = isBuiltinAgentId(agent.id);
          return (
            <AccordionItem
              key={agent.id}
              value={agent.id}
              id={agentElementId(agent.id)}
            >
              <AccordionTrigger>
                <SettingsSummary
                  icon={<AgentIcon agent={agent} size={18} />}
                  title={agentDisplayName(agent, t)}
                  badges={<Badge title={agent.id}>{agent.id}</Badge>}
                  description={`${description}${
                    builtin
                      ? `${description ? " · " : ""}${t.options.builtinAgentBadge}`
                      : ""
                  }`}
                />
              </AccordionTrigger>
              <AccordionContent>
                <div className="stack">
                  <Label>
                    {t.options.agentName}
                    <CommitInput
                      value={builtin ? agentDisplayName(agent, t) : agent.name}
                      disabled={builtin}
                      onCommit={(name) => updateAgent(agent.id, { name })}
                    />
                  </Label>
                  <Label>
                    {t.options.agentDescription}
                    <CommitInput
                      value={builtin ? description : agent.description || ""}
                      disabled={builtin}
                      placeholder={t.options.defaultAgentSummary}
                      onCommit={(description) =>
                        updateAgent(agent.id, { description })
                      }
                    />
                  </Label>
                  {!builtin && (
                    <>
                      <Label>
                        {t.options.agentPrompt}
                        <CommitTextarea
                          value={agent.prompt}
                          rows={5}
                          placeholder={t.options.agentPromptPlaceholder}
                          onCommit={(prompt) =>
                            updateAgent(agent.id, { prompt })
                          }
                        />
                      </Label>
                      <Label>
                        {t.options.agentModel}
                        <ModelSelect
                          t={t}
                          models={models}
                          value={agent.modelId}
                          label={t.options.agentModel}
                          noneLabel={t.options.modelSameAsChat}
                          onChange={(modelId) =>
                            updateAgent(agent.id, { modelId })
                          }
                        />
                      </Label>
                      <AgentIconPicker
                        value={agent.icon}
                        onChange={(icon) => updateAgent(agent.id, { icon })}
                      />
                    </>
                  )}
                  <AgentToolsEditor
                    agent={agent}
                    readOnly={builtin}
                    onChange={(patch) => updateAgent(agent.id, patch)}
                  />
                  {!builtin && agent.workspace && (
                    <AgentWorkspaceEditor
                      workspace={workspaceForAgent(agent.id)}
                    />
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
                    <ConfirmButton
                      disabled={builtin}
                      confirmLabel={
                        agent.workspace
                          ? t.options.deleteAgentWithWorkspace
                          : t.common.confirm
                      }
                      cancelLabel={t.common.cancel}
                      onConfirm={() => deleteAgent(agent.id)}
                    >
                      <Trash2 size={15} /> {t.options.deleteAgent}
                    </ConfirmButton>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <ResetDefaultsCard
        title={t.options.resetDefaultAgents}
        description={t.options.resetDefaultAgentsDescription}
        onResetBuiltins={resetBuiltinAgents}
        onResetAll={resetDefaultAgents}
      />
    </div>
  );
}
