import { Bot, Plus, Trash2 } from "lucide-react";
import { DEFAULT_AGENT_ID, createAgentDraft } from "../../src/shared/agents";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { Agent } from "../../src/shared/types";
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

export function AgentsPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [agents, setAgents] = useStoredState(storage.agents);
  const t = getMessages(language);
  const items = agents || [];
  const selectedAgentId = preferences?.selectedAgentId || DEFAULT_AGENT_ID;

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
                  <Label>
                    {t.options.agentInstructions}
                    <Textarea
                      value={agent.instructions || ""}
                      placeholder={t.options.agentInstructionsPlaceholder}
                      onChange={(event) =>
                        updateAgent(agent.id, {
                          instructions: event.currentTarget.value,
                        })
                      }
                    />
                  </Label>
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
