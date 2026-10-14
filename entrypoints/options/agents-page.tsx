import { useEffect, useRef, useState } from "react";
import { Download, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_ID,
  createAgentDraft,
  isBuiltinAgentId,
} from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { Agent } from "../../src/shared/types";
import { createWorkspace } from "../../src/shared/workspace";
import { storeAgentWorkspaces } from "../../src/shared/workspace-storage";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Feedback,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Input,
  Label,
  Textarea,
  SettingsSummary,
} from "../../src/ui/components";
import { AgentToolsEditor } from "./agent-tools-editor";
import { ModelSelect } from "./model-select";
import { AgentIconPicker } from "./agent-icon-picker";
import { useStoredState } from "../../src/ui/useStoredState";
import { AgentIcon } from "../../src/ui/agent-icons";
import {
  agentDisplayDescription,
  agentDisplayName,
} from "../../src/ui/agent-display";
import { AgentWorkspaceEditor } from "./agent-workspace-editor";
import { downloadAgentZip, importAgentZip } from "./workspace-import";

export function AgentsPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents, setAgents] = useStoredState(storage.agents);
  const [workspaces] = useStoredState(storage.agentWorkspaces);
  const importAgentInputRef = useRef<HTMLInputElement | null>(null);
  const [importAgentError, setImportAgentError] = useState("");
  const t = getMessages(language);
  const items = agents || [];
  const selectedAgentId = preferences?.selectedAgentId || DEFAULT_AGENT_ID;

  useEffect(() => {
    if (!agents) return;
    storeAgentWorkspaces(agents).catch(console.warn);
  }, [agents, workspaces]);

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
      const imported = await importAgentZip(file, {
        missingManifest: t.options.importAgentPackageMissingManifest,
        invalidManifest: t.options.importAgentPackageInvalidManifest,
      });
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
      {importAgentError ? <Feedback error>{importAgentError}</Feedback> : null}
      <Accordion type="multiple" className="stack">
        {items.map((agent) => {
          const description = agentDisplayDescription(agent, t);
          const builtin = isBuiltinAgentId(agent.id);
          return (
            <AccordionItem key={agent.id} value={agent.id}>
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
                  {!builtin && (
                    <>
                      <Label>
                        {t.options.agentPrompt}
                        <Textarea
                          value={agent.prompt}
                          rows={5}
                          placeholder={t.options.agentPromptPlaceholder}
                          onChange={(event) =>
                            updateAgent(agent.id, {
                              prompt: event.currentTarget.value,
                            })
                          }
                        />
                      </Label>
                      <Label>
                        {t.options.agentModel}
                        <ModelSelect
                          value={agent.modelId}
                          label={t.options.agentModel}
                          defaultLabel={t.options.modelSameAsChat}
                          onChange={(modelId) =>
                            updateAgent(agent.id, {
                              modelId: modelId || undefined,
                            })
                          }
                        />
                      </Label>
                    </>
                  )}
                  <AgentToolsEditor
                    t={t}
                    agent={agent}
                    readOnly={builtin}
                    onChange={(patch) => updateAgent(agent.id, patch)}
                  />
                  {!builtin && agent.workspace && (
                    <AgentWorkspaceEditor
                      workspace={workspaceForAgent(agent.id)}
                      t={t}
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
            <div className="row">
              <Button variant="outline" onClick={resetBuiltinAgents}>
                {t.options.resetBuiltins}
              </Button>
              <Button variant="outline" onClick={resetDefaultAgents}>
                {t.options.resetDefaults}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
