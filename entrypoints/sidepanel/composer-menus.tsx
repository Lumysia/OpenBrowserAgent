import {
  Check,
  ExternalLink,
  FileText,
  Layers,
  MousePointerClick,
  Paperclip,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Messages } from "../../src/shared/i18n";
import { DEFAULT_AGENT_ID } from "../../src/shared/agents";
import {
  modelIdParts,
  parseModelDisplayName,
} from "../../src/shared/model-display";
import { isProviderId } from "../../src/shared/providers";
import type {
  AttachmentTab,
  Agent,
  ModelConfig,
  PickedSkill,
  Preferences,
} from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ActionListItem,
} from "../../src/ui/components";
import { AgentIcon } from "../../src/ui/agent-icons";
import {
  providerNameDisplay,
  providerTypeLabel,
} from "../../src/ui/provider-display";
import {
  agentDisplayDescription,
  agentDisplayName,
} from "../../src/ui/agent-display";
import { ContextCard } from "./context-card";
import { COMPOSER_MENU, type ComposerMenu } from "./sidepanel-menu-state";
import { SkillPickerList } from "./skill-picker";
import { formatMessage } from "../../src/shared/text";
import { cn } from "../../src/ui/utils";

export function AddContextMenu({
  t,
  view,
  tabs,
  skills,
  selectedSkillIds,
  selectedTabIds,
  activeTabAttachable,
  onShowTabs,
  onShowSkills,
  onSkill,
  onUploadFiles,
  onToggleTab,
  onAttachTab,
  onSelectElement,
}: {
  t: Messages;
  view: "menu" | "tabs" | "skills";
  tabs: AttachmentTab[];
  skills: PickedSkill[];
  selectedSkillIds: string[];
  selectedTabIds: number[];
  activeTabAttachable: boolean;
  onShowTabs: () => void;
  onShowSkills: () => void;
  onSkill: (skill: PickedSkill) => void;
  onUploadFiles: () => void;
  onToggleTab: (tab: AttachmentTab) => void;
  onAttachTab: () => void;
  onSelectElement: () => void;
}) {
  const [displayView, setDisplayView] = useState(view);
  const [leavingView, setLeavingView] = useState<typeof view | null>(null);

  useEffect(() => {
    if (view === displayView) return;
    setLeavingView(displayView);
    setDisplayView(view);
    const timeout = window.setTimeout(() => setLeavingView(null), 180);
    return () => window.clearTimeout(timeout);
  }, [displayView, view]);

  function renderView(nextView: typeof view) {
    if (nextView === "menu")
      return (
        <div className="add-context-menu add-context-menu-compact">
          <ActionListItem
            icon={<Layers size={17} />}
            title={t.sidepanel.addNewTab}
            onClick={onShowTabs}
          />
          <ActionListItem
            icon={<Plus size={17} />}
            title={t.sidepanel.addCurrentTab}
            onClick={onAttachTab}
            disabled={!activeTabAttachable}
          />
          <ActionListItem
            icon={<Paperclip size={17} />}
            title={t.sidepanel.attachFiles}
            hint={t.sidepanel.attachFilesHint}
            onClick={onUploadFiles}
          />
          {!!skills.length && (
            <ActionListItem
              icon={<FileText size={17} />}
              title={t.options.skills}
              hint={skills.length}
              onClick={onShowSkills}
            />
          )}
          <ActionListItem
            icon={<MousePointerClick size={17} />}
            title={t.sidepanel.selectElement}
            onClick={onSelectElement}
            disabled={!activeTabAttachable}
          />
        </div>
      );

    if (nextView === "skills")
      return (
        <div className="add-context-menu">
          <div className="action-list-item muted">
            <FileText size={17} /> {t.options.skills} ({skills.length})
          </div>
          <SkillPickerList
            t={t}
            skills={skills}
            selectedIds={selectedSkillIds}
            onPick={onSkill}
          />
        </div>
      );

    return (
      <div className="add-context-menu">
        <Button
          variant="ghost"
          className={cn(
            "action-list-item muted",
            selectedTabIds.length === tabs.length && "active",
          )}
          onClick={() =>
            tabs.forEach((tab) => {
              if (
                selectedTabIds.length === tabs.length ||
                !selectedTabIds.includes(tab.id)
              )
                onToggleTab(tab);
            })
          }
        >
          <Layers size={17} />
          {t.sidepanel.allOpenTabs} ({tabs.length})
        </Button>
        <div>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              className={cn(
                "action-list-item",
                selectedTabIds.includes(tab.id) && "active",
              )}
              onClick={() => onToggleTab(tab)}
            >
              {tab.favIconUrl ? (
                <img
                  src={tab.favIconUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <ExternalLink size={20} />
              )}
              <span>
                <span
                  className="action-list-label"
                  title={
                    tab.title ||
                    tab.url ||
                    formatMessage(t.sidepanel.tabFallbackTitle, { id: tab.id })
                  }
                >
                  {tab.title ||
                    tab.url ||
                    formatMessage(t.sidepanel.tabFallbackTitle, { id: tab.id })}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="add-context-panel-shell" data-view={displayView}>
      {leavingView && (
        <div
          className="add-context-panel is-leaving"
          key={`leaving-${leavingView}`}
        >
          {renderView(leavingView)}
        </div>
      )}
      <div className="add-context-panel is-entering" key={displayView}>
        {renderView(displayView)}
      </div>
    </div>
  );
}

export function AttachedTabCard({
  t,
  tab,
  onRemove,
}: {
  t: Messages;
  tab: AttachmentTab;
  onRemove: () => void;
}) {
  return (
    <ContextCard
      icon={
        tab.favIconUrl ? (
          <img
            src={tab.favIconUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <ExternalLink size={18} />
        )
      }
      title={tab.title || t.sidepanel.currentPage}
      detail={`${tab.url || formatMessage(t.sidepanel.tabFallbackTitle, { id: tab.id })} · ${t.sidepanel.willBeSentToAi}`}
      removeLabel={t.sidepanel.removeTab}
      onRemove={onRemove}
    />
  );
}

export function ModelMenu({
  t,
  models,
  selectedModelId,
  onSelect,
}: {
  t: Messages;
  models: ModelConfig[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}) {
  return (
    <div className="model-menu">
      {!models.length && (
        <div className="composer-menu-empty">
          {t.sidepanel.noModelsConfigured}
        </div>
      )}
      {models.map((model) => (
        <Button
          variant="ghost"
          className={cn(
            "action-list-item model-menu-item",
            selectedModelId === model.id && "active",
          )}
          key={model.id}
          onClick={() => onSelect(model.id)}
        >
          <span className="model-provider-mark">
            {providerName(model, t).slice(0, 1).toUpperCase()}
          </span>
          <span>
            <small>{providerName(model, t)}</small>
            <strong title={modelLabel(model)}>{modelLabel(model)}</strong>
          </span>
          {selectedModelId === model.id && (
            <Check className="menu-check" size={14} />
          )}
        </Button>
      ))}
    </div>
  );
}

function AgentMenu({
  t,
  agents,
  selectedAgentId,
  onSelectAgent,
}: {
  t: Messages;
  agents: Agent[];
  selectedAgentId?: string;
  onSelectAgent: (agentId: string) => void;
}) {
  return (
    <div className="agent-menu">
      {agents.map((agent) => {
        const selected = selectedAgentId === agent.id;
        return (
          <Button
            variant="ghost"
            className={cn(
              "action-list-item agent-menu-item",
              selected && "active",
            )}
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
          >
            <AgentIcon agent={agent} />
            <span>
              <strong title={agentDisplayName(agent, t)}>
                {agentDisplayName(agent, t)}
              </strong>
              <small title={agentDisplayDescription(agent, t)}>
                {agentDisplayDescription(agent, t)}
              </small>
            </span>
            {selected && <Check className="menu-check" size={14} />}
          </Button>
        );
      })}
    </div>
  );
}

export function AgentSelector({
  t,
  agents,
  preferences,
  openMenu,
  streaming,
  onSetOpenMenu,
  onSetPreferences,
}: {
  t: Messages;
  agents: Agent[];
  preferences?: Preferences;
  openMenu: ComposerMenu | null;
  streaming: boolean;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetPreferences: (
    value: Preferences | ((previous: Preferences) => Preferences),
  ) => void;
}) {
  const selectedAgent =
    agents.find((agent) => agent.id === preferences?.selectedAgentId) ||
    agents.find((agent) => agent.id === DEFAULT_AGENT_ID) ||
    agents[0];
  return (
    <Popover
      open={openMenu === COMPOSER_MENU.agent}
      onOpenChange={(open) => onSetOpenMenu(open ? COMPOSER_MENU.agent : null)}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="composer-trigger composer-agent-trigger"
          disabled={streaming}
          aria-label={
            selectedAgent ? agentDisplayName(selectedAgent, t) : t.words.agent
          }
        >
          <AgentIcon agent={selectedAgent} size={15} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="agent-popover-content" align="end">
        <AgentMenu
          t={t}
          agents={agents}
          selectedAgentId={selectedAgent?.id}
          onSelectAgent={(agentId) => {
            onSetPreferences((previous) => ({
              ...previous,
              selectedAgentId: agentId,
            }));
            onSetOpenMenu(null);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function selectedModelLabel(
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
