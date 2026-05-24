import { useState } from "react";
import {
  Check,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  createLocalAgentDraft,
  generateLocalAgentSecret,
  normalizeLocalAgents,
} from "../../src/shared/local-agents";
import { sendLocalAgentRuntimeRequest } from "../../src/shared/local-agent-runtime";
import { getMessages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import type { LocalAgentConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTriggerButton,
  Badge,
  Button,
  CardDescription,
  Input,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function LocalAgentsPage() {
  const [language] = useStoredState(storage.language);
  const [agents, setAgents] = useStoredState(storage.localAgents);
  const [testingAgentId, setTestingAgentId] = useState("");
  const [recentlyTestedAgentId, setRecentlyTestedAgentId] = useState("");
  const t = getMessages(language);
  const items = normalizeLocalAgents(agents);

  function addAgent() {
    setAgents((current) => [
      ...normalizeLocalAgents(current),
      createLocalAgentDraft(t.options.newLocalAgent),
    ]);
  }

  function updateAgent(agentId: string, patch: Partial<LocalAgentConfig>) {
    setAgents((current) =>
      normalizeLocalAgents(current).map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              ...patch,
              ...testResetPatch(patch),
              updatedAt: Date.now(),
            }
          : agent,
      ),
    );
  }

  function deleteAgent(agentId: string) {
    setAgents((current) =>
      normalizeLocalAgents(current).filter((agent) => agent.id !== agentId),
    );
  }

  async function testAgent(agentId: string) {
    setTestingAgentId(agentId);
    try {
      await sendLocalAgentRuntimeRequest({ operation: "test", agentId });
      updateAgent(agentId, { lastTestedAt: Date.now(), lastTestError: "" });
      setRecentlyTestedAgentId(agentId);
      window.setTimeout(() => {
        setRecentlyTestedAgentId((current) =>
          current === agentId ? "" : current,
        );
      }, 2500);
      return true;
    } catch (error) {
      updateAgent(agentId, {
        lastTestedAt: undefined,
        lastTestError: `${t.options.localAgentTestError}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    } finally {
      setTestingAgentId("");
    }
  }

  return (
    <div className="stack">
      <div className="settings-page-header">
        <div>
          <h1 className="settings-page-title">
            <TerminalSquare size={24} /> {t.options.localAgents}
          </h1>
          <p className="muted">{t.options.localAgentsDescription}</p>
        </div>
        <div className="settings-page-actions">
          <Button onClick={addAgent}>
            <Plus size={15} /> {t.options.newLocalAgent}
          </Button>
        </div>
      </div>
      {!items.length ? (
        <CardDescription>{t.options.localAgentsEmpty}</CardDescription>
      ) : null}
      <Accordion type="multiple" className="stack">
        {items.map((agent) => (
          <AccordionItem key={agent.id} value={agent.id}>
            <AccordionHeader className="ui-accordion-header-with-actions">
              <AccordionTriggerButton hideChevron>
                <span className="agent-summary">
                  <span className="agent-summary-title">
                    <TerminalSquare size={18} />
                    <span>{agent.name}</span>
                    <Badge>{agent.id.slice(0, 8)}</Badge>
                    {agent.lastTestError ? (
                      <Badge className="status-error-badge">
                        {t.options.localAgentTestError}
                      </Badge>
                    ) : null}
                  </span>
                  <small>{agent.description || agent.hostName}</small>
                </span>
              </AccordionTriggerButton>
              <span
                className="accordion-trigger-actions"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="tooltip-button-wrapper">
                      <Button
                        size="icon"
                        aria-label={
                          testingAgentId === agent.id
                            ? t.options.localAgentTesting
                            : t.options.localAgentTest
                        }
                        disabled={
                          testingAgentId === agent.id || !agent.hostName
                        }
                        onClick={() => testAgent(agent.id)}
                      >
                        {testingAgentId === agent.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : recentlyTestedAgentId === agent.id ? (
                          <Check size={14} />
                        ) : (
                          <FlaskConical size={14} />
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {testingAgentId === agent.id
                      ? t.options.localAgentTesting
                      : t.options.localAgentTest}
                  </TooltipContent>
                </Tooltip>
              </span>
              <AccordionTriggerButton
                className="accordion-chevron-trigger"
                aria-label={agent.name || t.options.newLocalAgent}
              />
            </AccordionHeader>
            <AccordionContent>
              <div className="stack">
                <Label>
                  {t.options.localAgentName}
                  <Input
                    value={agent.name}
                    onChange={(event) =>
                      updateAgent(agent.id, { name: event.currentTarget.value })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localAgentDescription}
                  <Textarea
                    value={agent.description || ""}
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        description: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localAgentHostName}
                  <Input
                    value={agent.hostName}
                    placeholder="openbrowseragent.local_execution_bridge"
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        hostName: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localAgentHostAddress}
                  <Input
                    value={agent.hostAddress || ""}
                    placeholder={t.options.localAgentHostAddressPlaceholder}
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        hostAddress: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localAgentSecret}
                  <div className="row">
                    <Input
                      value={agent.secret || ""}
                      onChange={(event) =>
                        updateAgent(agent.id, {
                          secret: event.currentTarget.value,
                        })
                      }
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={t.options.localAgentRegenerateSecret}
                          onClick={() =>
                            updateAgent(agent.id, {
                              secret: generateLocalAgentSecret(),
                            })
                          }
                        >
                          <RefreshCw size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t.options.localAgentRegenerateSecret}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </Label>
                <Label>
                  {t.options.localAgentKey}
                  <Input
                    value={agent.agentKey || ""}
                    placeholder="default"
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        agentKey: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localAgentDefaultCwd}
                  <Input
                    value={agent.defaultCwd || ""}
                    placeholder="~/Desktop"
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        defaultCwd: event.currentTarget.value,
                      })
                    }
                  />
                </Label>
                <Label>
                  {t.options.localAgentTimeoutMs}
                  <Input
                    type="number"
                    min={1000}
                    value={agent.timeoutMs || 120000}
                    onChange={(event) =>
                      updateAgent(agent.id, {
                        timeoutMs: Number(event.currentTarget.value),
                      })
                    }
                  />
                </Label>
                {agent.lastTestError ? (
                  <CardDescription>{agent.lastTestError}</CardDescription>
                ) : null}
                {isLocalAgentTested(agent) ? (
                  <CardDescription>
                    {t.options.localAgentTestSuccess}
                  </CardDescription>
                ) : null}
                <div className="row">
                  <Button
                    variant="destructiveOutline"
                    onClick={() => deleteAgent(agent.id)}
                  >
                    <Trash2 size={15} /> {t.options.deleteLocalExecutionBridge}
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function isLocalAgentTested(agent: LocalAgentConfig) {
  return !!agent.lastTestedAt && !agent.lastTestError;
}

function testResetPatch(patch: Partial<LocalAgentConfig>) {
  if (
    !("hostName" in patch) &&
    !("hostAddress" in patch) &&
    !("secret" in patch) &&
    !("agentKey" in patch)
  )
    return {};
  return { lastTestedAt: undefined, lastTestError: "" };
}
