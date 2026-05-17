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
import type { Messages } from "../../src/shared/i18n";
import { providerLabels } from "../../src/shared/types";
import type {
  AttachmentTab,
  ChatMode,
  ModelConfig,
  QuickAction,
} from "../../src/shared/types";
import { CHAT_MODE } from "../../src/shared/types";

export function AddContextMenu({
  t,
  view,
  tabs,
  quickActions,
  selectedTabIds,
  onShowTabs,
  onQuickAction,
  onUploadFiles,
  onToggleTab,
  onAttachTab,
  onSelectElement,
}: {
  t: Messages;
  view: "menu" | "tabs";
  tabs: AttachmentTab[];
  quickActions: QuickAction[];
  selectedTabIds: number[];
  onShowTabs: () => void;
  onQuickAction: (action: QuickAction) => void;
  onUploadFiles: () => void;
  onToggleTab: (tab: AttachmentTab) => void;
  onAttachTab: () => void;
  onSelectElement: () => void;
}) {
  if (view === "menu") {
    return (
      <div className="add-context-menu add-context-menu-compact">
        <button className="composer-menu-item" onClick={onShowTabs}>
          <Layers size={17} />
          <span>
            <strong>{t.sidepanel.addNewTab}</strong>
          </span>
        </button>
        <button className="composer-menu-item" onClick={onUploadFiles}>
          <Paperclip size={17} />
          <span>
            <strong>{t.sidepanel.attachFiles}</strong>
            <small>{t.sidepanel.attachFilesHint}</small>
          </span>
        </button>
        {!!quickActions.length && (
          <>
            <div className="composer-menu-section-title">
              {t.options.quickActions}
            </div>
            {quickActions.map((action) => (
              <button
                key={action.id}
                className="composer-menu-item"
                onClick={() => onQuickAction(action)}
              >
                <FileText size={17} />
                <span>
                  <strong>{action.title || t.options.untitledAction}</strong>
                </span>
              </button>
            ))}
          </>
        )}
        <button className="composer-menu-item" onClick={onSelectElement}>
          <MousePointerClick size={17} />
          <span>
            <strong>{t.sidepanel.selectElement}</strong>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="add-context-menu add-tabs-panel">
      <div className="tab-picker-title">
        <Layers size={17} /> {t.sidepanel.allOpenTabs} ({tabs.length})
      </div>
      <div className="tab-picker-list">
        <button
          className={`tab-picker-item ${selectedTabIds.length === tabs.length ? "active" : ""}`}
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
          <Layers size={20} />
          <span>
            {t.sidepanel.allOpenTabs} ({tabs.length})
          </span>
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-picker-item ${selectedTabIds.includes(tab.id) ? "active" : ""}`}
            onClick={() => onToggleTab(tab)}
          >
            {tab.favIconUrl ? (
              <img src={tab.favIconUrl} alt="" />
            ) : (
              <ExternalLink size={20} />
            )}
            <span>{tab.title || tab.url || `Tab ${tab.id}`}</span>
          </button>
        ))}
      </div>
      <div className="tab-picker-actions">
        <button className="composer-menu-item" onClick={onAttachTab}>
          <Plus size={17} />
          <span>
            <strong>{t.sidepanel.addCurrentTab}</strong>
          </span>
        </button>
        <button className="composer-menu-item" onClick={onSelectElement}>
          <MousePointerClick size={17} />
          <span>
            <strong>{t.sidepanel.selectElement}</strong>
          </span>
        </button>
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
      <button className="context-close" title="Remove tab" onClick={onRemove}>
        <X size={14} />
      </button>
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
        <button
          className="model-menu-item"
          key={model.id}
          onClick={() => onSelect(model.id)}
        >
          <span className="model-provider-mark">
            {providerInitial(model.id)}
          </span>
          <span>
            <small>{providerName(model.id)}</small>
            <strong>{model.name}</strong>
          </span>
          {selectedModelId === model.id && (
            <Check className="menu-check" size={18} />
          )}
        </button>
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
        <button
          className={`mode-menu-item ${mode === item.id ? "active" : ""}`}
          key={item.id}
          onClick={() => onSelect(item.id)}
        >
          <span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
          {mode === item.id && <Check className="menu-check" size={18} />}
        </button>
      ))}
    </div>
  );
}

export function selectedModelLabel(
  modelId: string | undefined,
  models: ModelConfig[],
  t: Messages,
) {
  const model = models.find((candidate) => candidate.id === modelId);
  return model?.name || t.sidepanel.selectModel;
}

function providerName(modelId: string) {
  const provider = modelId.split(":")[0] as keyof typeof providerLabels;
  return providerLabels[provider] || provider;
}

function providerInitial(modelId: string) {
  return providerName(modelId).slice(0, 1).toUpperCase();
}
