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
import {
  createWorkspace,
  ensureAgentWorkspaces,
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
} from "../../src/ui/components";
import { AgentCapabilityEditor } from "./agent-capability-editor";
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
    storage.agentWorkspaces
      .update((current) => {
        const ensured = ensureAgentWorkspaces(agents, current);
        return ensured.changed
          ? [
              ...ensured.workspaces,
              ...current.filter(
                (workspace) =>
                  !agents.some((agent) => agent.id === workspace.agentId),
              ),
            ]
          : current;
      })
      .catch(console.warn);
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
    storage.agentWorkspaces
      .set(BUILTIN_AGENTS.map((agent) => createWorkspace(agent.id, now)))
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
                <span className="settings-summary">
                  <span className="settings-summary-title">
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
                        t={t}
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
