import {
  Check,
  ExternalLink,
  FileText,
  HelpCircle,
  Layers,
  Bot,
  MousePointerClick,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { DEFAULT_AGENT_ID } from "../../src/shared/agents";
import { providerLabels } from "../../src/shared/types";
import type {
  AttachmentTab,
  Agent,
  ChatMode,
  ModelConfig,
  Preferences,
  Skill,
} from "../../src/shared/types";
import { CHAT_MODE } from "../../src/shared/types";
import { getSkillDisplayName } from "../../src/shared/skills";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/ui/components";
import { IconTooltip } from "./icon-tooltip";
import { COMPOSER_MENU, type ComposerMenu } from "./sidepanel-menu-state";

export function AddContextMenu({
  t,
  view,
  tabs,
  skills,
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
  if (view === "menu") {
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
  }

  if (view === "skills") {
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
              className="action-list-item"
              onClick={() => onSkill(skill)}
            >
              <FileText size={20} />
              <span>{getSkillDisplayName(skill, t.options.untitledSkill)}</span>
            </Button>
          ))}
        </div>
      </div>
    );
  }

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
        <Layers size={17} /> {t.sidepanel.allOpenTabs} ({tabs.length})
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
    <div className="context-card">
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
          onClick={onRemove}
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

export function ModeMenu({
  t,
  mode,
  agents,
  selectedAgentId,
  onSelect,
  onSelectAgent,
}: {
  t: Messages;
  mode: ChatMode;
  agents: Agent[];
  selectedAgentId?: string;
  onSelect: (mode: ChatMode) => void;
  onSelectAgent: (agentId: string) => void;
}) {
  return (
    <div className="mode-menu">
      {agents.map((agent) => {
        const selected =
          mode === CHAT_MODE.agent && selectedAgentId === agent.id;
        return (
          <Button
            variant="ghost"
            className={`action-list-item mode-menu-item ${selected ? "active" : ""}`}
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
          >
            <Bot size={17} />
            <span>
              <strong>{agentDisplayName(agent, t)}</strong>
              <small>
                {agent.description || t.options.defaultAgentSummary}
              </small>
            </span>
            {selected && <Check className="menu-check" size={14} />}
          </Button>
        );
      })}
      <Button
        variant="ghost"
        className={`action-list-item mode-menu-item ${mode === CHAT_MODE.ask ? "active" : ""}`}
        onClick={() => onSelect(CHAT_MODE.ask)}
      >
        <HelpCircle size={17} />
        <span>
          <strong>{t.words.ask}</strong>
          <small>{t.sidepanel.askDescription}</small>
        </span>
        {mode === CHAT_MODE.ask && <Check className="menu-check" size={14} />}
      </Button>
    </div>
  );
}

function agentDisplayName(agent: Agent, t: Messages) {
  return agent.id === DEFAULT_AGENT_ID ? t.words.agent : agent.name;
}

export function ModeSelector({
  t,
  mode,
  agents,
  preferences,
  openMenu,
  aiWorking,
  onSetMode,
  onSetOpenMenu,
  onSetPreferences,
}: {
  t: Messages;
  mode: ChatMode;
  agents: Agent[];
  preferences?: Preferences;
  openMenu: ComposerMenu | null;
  aiWorking: boolean;
  onSetMode: (value: ChatMode) => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetPreferences: (
    value: Preferences | ((previous: Preferences) => Preferences),
  ) => void;
}) {
  return (
    <Popover
      open={openMenu === COMPOSER_MENU.mode}
      onOpenChange={(open) => onSetOpenMenu(open ? COMPOSER_MENU.mode : null)}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="composer-trigger composer-mode-trigger"
          disabled={aiWorking}
          aria-label={mode === CHAT_MODE.agent ? t.words.agent : t.words.ask}
        >
          {modeIcon(mode)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="mode-popover-content" align="end">
        <ModeMenu
          t={t}
          mode={mode}
          agents={agents}
          selectedAgentId={preferences?.selectedAgentId}
          onSelect={(nextMode) => {
            onSetMode(nextMode);
            onSetOpenMenu(null);
          }}
          onSelectAgent={(agentId) => {
            onSetMode(CHAT_MODE.agent);
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

export function modeIcon(mode: ChatMode) {
  return mode === CHAT_MODE.agent ? (
    <Bot size={15} />
  ) : (
    <HelpCircle size={15} />
  );
}

export function selectedModelLabel(
  modelId: string | undefined,
  models: ModelConfig[],
  t: Messages,
) {
  const model = models.find((candidate) => candidate.id === modelId);
  return model ? modelDisplayName(model) : t.sidepanel.selectModel;
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
