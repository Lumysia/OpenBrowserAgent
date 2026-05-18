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
import { providerLabels } from "../../src/shared/types";
import type {
  AttachmentTab,
  ChatMode,
  ModelConfig,
  Skill,
} from "../../src/shared/types";
import { CHAT_MODE } from "../../src/shared/types";
import { getSkillDisplayName } from "../../src/shared/skills";
import { Button } from "../../src/ui/components";

export function AddContextMenu({
  t,
  view,
  tabs,
  skills,
  selectedTabIds,
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
      <Button
        variant="ghost"
        size="icon"
        className="context-close"
        title="Remove tab"
        onClick={onRemove}
      >
        <X size={14} />
      </Button>
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
  onSelect,
}: {
  t: Messages;
  mode: ChatMode;
  onSelect: (mode: ChatMode) => void;
}) {
  const modes: Array<{ id: ChatMode; title: string; description: string }> = [
    {
      id: CHAT_MODE.agent,
      title: t.words.agent,
      description: t.sidepanel.agentDescription,
    },
    {
      id: CHAT_MODE.ask,
      title: t.words.ask,
      description: t.sidepanel.askDescription,
    },
  ];
  return (
    <div className="mode-menu">
      {modes.map((item) => (
        <Button
          variant="ghost"
          className={`action-list-item mode-menu-item ${mode === item.id ? "active" : ""}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          {item.id === CHAT_MODE.agent ? (
            <Bot size={17} />
          ) : (
            <HelpCircle size={17} />
          )}
          <span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
          {mode === item.id && <Check className="menu-check" size={14} />}
        </Button>
      ))}
    </div>
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
