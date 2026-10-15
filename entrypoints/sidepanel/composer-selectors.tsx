import { Brain } from "lucide-react";
import type { ReactNode } from "react";
import { DEFAULT_AGENT_ID } from "../../src/shared/agents";
import type { Messages } from "../../src/shared/i18n";
import {
  modelIdParts,
  parseModelDisplayName,
} from "../../src/shared/model-display";
import {
  REASONING_EFFORT,
  REASONING_EFFORT_OPTIONS,
  type ReasoningEffort,
} from "../../src/shared/reasoning";
import { isProviderId } from "../../src/shared/providers";
import type { ModelConfig, Preferences } from "../../src/shared/types";
import {
  ActionListItem,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/ui/components";
import { AgentIcon } from "../../src/ui/agent-icons";
import {
  agentDisplayDescription,
  agentDisplayName,
} from "../../src/ui/agent-display";
import { useMessages } from "../../src/ui/messages";
import {
  providerNameDisplay,
  providerTypeLabel,
} from "../../src/ui/provider-display";
import { cn } from "../../src/ui/utils";
import { COMPOSER_MENU, type ComposerMenu } from "./sidepanel-menu-state";
import { useChat, useComposer } from "./sidepanel-providers";

const REASONING_EFFORT_LABEL = {
  [REASONING_EFFORT.default]: "reasoningEffortDefault",
  [REASONING_EFFORT.low]: "reasoningEffortLow",
  [REASONING_EFFORT.medium]: "reasoningEffortMedium",
  [REASONING_EFFORT.high]: "reasoningEffortHigh",
} as const satisfies Record<ReasoningEffort, keyof Messages["sidepanel"]>;

// The model, reasoning effort and agent the next message uses.
export function ComposerSelectors() {
  const t = useMessages();
  const { preferences, setPreferences, configuredModels, agents } =
    useComposer();
  const choose = (patch: Partial<Preferences>) =>
    setPreferences((previous) => ({ ...previous, ...patch }));
  const effort = preferences?.reasoningEffort || REASONING_EFFORT.default;
  const selectedAgent =
    agents.find((agent) => agent.id === preferences?.selectedAgentId) ||
    agents.find((agent) => agent.id === DEFAULT_AGENT_ID) ||
    agents[0];

  return (
    <div className="composer-selectors">
      <SelectorPopover
        menu={COMPOSER_MENU.model}
        kind="model"
        trigger={selectedModelLabel(
          preferences?.selectedModelId,
          configuredModels,
          t,
        )}
      >
        {(close) => (
          <div className="model-menu">
            {!configuredModels.length && (
              <div className="composer-menu-empty">
                {t.sidepanel.noModelsConfigured}
              </div>
            )}
            {configuredModels.map((model) => {
              const provider = providerName(model, t);
              return (
                <ActionListItem
                  key={model.id}
                  className="model-menu-item"
                  icon={
                    <span className="model-provider-mark">
                      {provider.slice(0, 1).toUpperCase()}
                    </span>
                  }
                  title={modelLabel(model)}
                  hint={provider}
                  checked={preferences?.selectedModelId === model.id}
                  onClick={() => {
                    if (preferences) choose({ selectedModelId: model.id });
                    close();
                  }}
                />
              );
            })}
          </div>
        )}
      </SelectorPopover>
      <SelectorPopover
        menu={COMPOSER_MENU.reasoning}
        kind="reasoning"
        label={t.sidepanel.reasoningEffort}
        trigger={<ReasoningEffortIcon effort={effort} />}
      >
        {(close) => (
          <div className="add-context-menu reasoning-effort-menu">
            <div className="action-list-item muted">
              <Brain size={17} />
              <span>
                <strong>{t.sidepanel.reasoningEffort}</strong>
                <small>{t.sidepanel.reasoningEffortDescription}</small>
              </span>
            </div>
            {REASONING_EFFORT_OPTIONS.map((option) => (
              <ActionListItem
                key={option}
                icon={<ReasoningEffortIcon effort={option} />}
                title={t.sidepanel[REASONING_EFFORT_LABEL[option]]}
                checked={option === effort}
                onClick={() => {
                  choose({ reasoningEffort: option });
                  close();
                }}
              />
            ))}
          </div>
        )}
      </SelectorPopover>
      <SelectorPopover
        menu={COMPOSER_MENU.agent}
        kind="agent"
        label={
          selectedAgent ? agentDisplayName(selectedAgent, t) : t.words.agent
        }
        trigger={<AgentIcon agent={selectedAgent} size={15} />}
      >
        {(close) => (
          <div className="agent-menu">
            {agents.map((agent) => (
              <ActionListItem
                key={agent.id}
                className="agent-menu-item"
                icon={<AgentIcon agent={agent} />}
                title={agentDisplayName(agent, t)}
                hint={agentDisplayDescription(agent, t)}
                checked={selectedAgent?.id === agent.id}
                onClick={() => {
                  choose({ selectedAgentId: agent.id });
                  close();
                }}
              />
            ))}
          </div>
        )}
      </SelectorPopover>
    </div>
  );
}

// One composer menu: an outline trigger, disabled while the chat streams,
// and its popover; at most one composer menu is open.
function SelectorPopover({
  menu,
  kind,
  label,
  trigger,
  children,
}: {
  menu: ComposerMenu;
  kind: "model" | "reasoning" | "agent";
  label?: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const { streaming } = useChat();
  const { openMenu, setOpenMenu } = useComposer();
  return (
    <div className={`selector-anchor ${kind}-anchor`}>
      <Popover
        open={openMenu === menu}
        onOpenChange={(open) => setOpenMenu(open ? menu : null)}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("composer-trigger", `composer-${kind}-trigger`)}
            disabled={streaming}
            aria-label={label}
          >
            {trigger}
          </Button>
        </PopoverTrigger>
        <PopoverContent className={`${kind}-popover-content`} align="end">
          {children(() => setOpenMenu(null))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReasoningEffortIcon({ effort }: { effort: ReasoningEffort }) {
  return (
    <span className="reasoning-effort-icon" data-effort={effort}>
      <Brain size={15} />
      <span className="reasoning-effort-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

function selectedModelLabel(
  modelId: string | undefined,
  models: ModelConfig[],
  t: Messages,
) {
  const model = models.find((candidate) => candidate.id === modelId);
  if (model) return modelLabel(model);
  return modelId ? modelIdParts(modelId).name : t.sidepanel.selectModel;
}

function providerName(model: ModelConfig, t: Messages) {
  const { provider } = parseModelDisplayName(model);
  if (provider) return providerNameDisplay(provider, t);
  const { providerKey } = modelIdParts(model.id);
  return isProviderId(providerKey)
    ? providerTypeLabel(providerKey, t)
    : providerKey;
}

function modelLabel(model: ModelConfig) {
  return parseModelDisplayName(model).label;
}
