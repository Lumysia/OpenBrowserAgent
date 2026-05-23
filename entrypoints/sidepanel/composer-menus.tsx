import {
  Check,
  ExternalLink,
  FileText,
  Layers,
  MousePointerClick,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Messages } from "../../src/shared/i18n";
import { DEFAULT_AGENT_ID } from "../../src/shared/agents";
import { providerLabels } from "../../src/shared/types";
import type {
  AttachmentTab,
  Agent,
  ModelConfig,
  Preferences,
  Skill,
} from "../../src/shared/types";
import { getSkillDisplayName } from "../../src/shared/skills";
import {
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
import { IconTooltip } from "./icon-tooltip";
import { useDeferredRemove } from "./use-deferred-remove";
import { COMPOSER_MENU, type ComposerMenu } from "./sidepanel-menu-state";

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
  skills: Skill[];
  selectedSkillIds: string[];
  selectedTabIds: number[];
  activeTabAttachable: boolean;
  onShowTabs: () => void;
  onShowSkills: () => void;
  onSkill: (skill: Skill) => void;
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
          <Button
            variant="ghost"
            className="action-list-item"
            onClick={onShowTabs}
          >
            <Layers size={17} />
            <span>
              <strong>{t.sidepanel.addNewTab}</strong>
            </span>
          </Button>
          <Button
            variant="ghost"
            className="action-list-item"
            onClick={onAttachTab}
            disabled={!activeTabAttachable}
          >
            <Plus size={17} />
            <span>
              <strong>{t.sidepanel.addCurrentTab}</strong>
            </span>
          </Button>
          <Button
            variant="ghost"
            className="action-list-item"
            onClick={onUploadFiles}
          >
            <Paperclip size={17} />
            <span>
              <strong>{t.sidepanel.attachFiles}</strong>
              <small>{t.sidepanel.attachFilesHint}</small>
            </span>
          </Button>
          {!!skills.length && (
            <Button
              variant="ghost"
              className="action-list-item"
              onClick={onShowSkills}
            >
              <FileText size={17} />
              <span>
                <strong>{t.options.skills}</strong>
                <small>{skills.length}</small>
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            className="action-list-item"
            onClick={onSelectElement}
            disabled={!activeTabAttachable}
          >
            <MousePointerClick size={17} />
            <span>
              <strong>{t.sidepanel.selectElement}</strong>
            </span>
          </Button>
        </div>
      );

    if (nextView === "skills")
      return (
        <div className="add-context-menu">
          <div className="action-list-item muted">
            <FileText size={17} /> {t.options.skills} ({skills.length})
          </div>
          <div>
            {skills.map((skill) => (
              <Button
                key={skill.id}
                variant="ghost"
                className={`action-list-item ${selectedSkillIds.includes(skill.id) ? "active" : ""}`}
                onClick={() => onSkill(skill)}
              >
                <FileText size={20} />
                <span>
                  {getSkillDisplayName(skill, t.options.untitledSkill)}
                </span>
                {selectedSkillIds.includes(skill.id) && (
                  <Check className="menu-check" size={14} />
                )}
              </Button>
            ))}
          </div>
        </div>
      );

    return (
      <div className="add-context-menu">
        <Button
          variant="ghost"
          className={`action-list-item muted ${selectedTabIds.length === tabs.length ? "active" : ""}`}
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
              className={`action-list-item ${selectedTabIds.includes(tab.id) ? "active" : ""}`}
              onClick={() => onToggleTab(tab)}
            >
              {tab.favIconUrl ? (
                <img src={tab.favIconUrl} alt="" />
              ) : (
                <ExternalLink size={20} />
              )}
              <span>{tab.title || tab.url || `Tab ${tab.id}`}</span>
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
  const { removing, remove } = useDeferredRemove(onRemove);
  return (
    <div className={`context-card ${removing ? "is-removing" : ""}`}>
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" />
      ) : (
        <ExternalLink size={18} />
      )}
      <span>
        <strong>{tab.title || t.sidepanel.currentPage}</strong>
        <small>
          {tab.url || `Tab ${tab.id}`} · {t.sidepanel.willBeSentToAi}
        </small>
      </span>
      <IconTooltip label={t.sidepanel.removeTab}>
        <Button
          variant="ghost"
          size="icon"
          className="context-close"
          aria-label={t.sidepanel.removeTab}
          onClick={remove}
        >
          <X size={14} />
        </Button>
      </IconTooltip>
    </div>
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
          className={`action-list-item model-menu-item ${selectedModelId === model.id ? "active" : ""}`}
          key={model.id}
          onClick={() => onSelect(model.id)}
        >
          <span className="model-provider-mark">
            {providerName(model).slice(0, 1).toUpperCase()}
          </span>
          <span>
            <small>{providerName(model)}</small>
            <strong>{modelDisplayName(model)}</strong>
          </span>
          {selectedModelId === model.id && (
            <Check className="menu-check" size={14} />
          )}
        </Button>
      ))}
    </div>
  );
}

export function AgentMenu({
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
            className={`action-list-item agent-menu-item ${selected ? "active" : ""}`}
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
          >
            <AgentIcon agent={agent} />
            <span>
              <strong>{agentDisplayName(agent, t)}</strong>
              <small>{agentDisplayDescription(agent, t)}</small>
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
  aiWorking,
  onSetOpenMenu,
  onSetPreferences,
}: {
  t: Messages;
  agents: Agent[];
  preferences?: Preferences;
  openMenu: ComposerMenu | null;
  aiWorking: boolean;
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
          disabled={aiWorking}
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
  return model
    ? modelDisplayName(model)
    : modelId
      ? modelId.split(":").slice(1).join(":") || modelId
      : t.sidepanel.selectModel;
}

function providerName(model: ModelConfig) {
  const fromDisplay = model.displayName?.split("/")[0]?.trim();
  if (fromDisplay) return fromDisplay;
  const provider = model.id.split(":")[0] as keyof typeof providerLabels;
  return providerLabels[provider] || provider;
}

function modelDisplayName(model: ModelConfig) {
  const fromDisplay = model.displayName?.split("/").slice(1).join("/").trim();
  return fromDisplay || model.name;
}
