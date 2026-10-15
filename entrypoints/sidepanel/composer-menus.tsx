import {
  ExternalLink,
  FileText,
  Layers,
  MousePointerClick,
  Paperclip,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AttachmentTab } from "../../src/shared/types";
import { ActionListItem, Button } from "../../src/ui/components";
import { ContextCard } from "./context-card";
import { ADD_MENU_VIEW, type AddMenuView } from "./sidepanel-menu-state";
import { useComposer } from "./sidepanel-providers";
import { SkillPickerList } from "./skill-picker";
import { formatMessage } from "../../src/shared/text";
import { cn } from "../../src/ui/utils";
import { UI_STATE } from "../../src/ui/ui-state";
import { useMessages } from "../../src/ui/messages";
import { cssDurationMs, DURATION_TOKEN } from "../../src/ui/motion";

export function AddContextMenu({
  onPickFiles,
}: {
  // Opens the file picker for attachments.
  onPickFiles: () => void;
}) {
  const t = useMessages();
  const composer = useComposer();
  const {
    addMenuView: view,
    availableTabs: tabs,
    skills,
    activeTabAttachable,
    setOpenMenu,
  } = composer;
  const selectedSkillIds = composer.selectedSkills.map((skill) => skill.id);
  const selectedTabIds = composer.attachedTabs.map((tab) => tab.id);
  const onShowTabs = composer.showAllTabsPicker;
  const onShowSkills = () => composer.setAddMenuView(ADD_MENU_VIEW.skills);
  const onSkill = composer.toggleSkill;
  const onToggleTab = composer.toggleAttachedTab;
  const onUploadFiles = () => {
    onPickFiles();
    setOpenMenu(null);
  };
  const onAttachTab = async () => {
    await composer.attachActiveTab();
    setOpenMenu(null);
  };
  const onSelectElement = async () => {
    await composer.selectElement();
    setOpenMenu(null);
  };
  const [displayView, setDisplayView] = useState(view);
  const [leavingView, setLeavingView] = useState<AddMenuView | null>(null);

  useEffect(() => {
    if (view === displayView) return;
    setLeavingView(displayView);
    setDisplayView(view);
    // The leaving view is dropped once its exit animation ends.
    const timeout = window.setTimeout(
      () => setLeavingView(null),
      cssDurationMs(DURATION_TOKEN.fast),
    );
    return () => window.clearTimeout(timeout);
  }, [displayView, view]);

  function renderView(nextView: AddMenuView) {
    if (nextView === "menu")
      return (
        <div className="add-context-menu add-context-menu-compact">
          <ActionListItem
            icon={<Layers size={17} />}
            title={t.sidepanel.addOpenTabs}
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
          className="add-context-panel"
          data-state={UI_STATE.leaving}
          key={`leaving-${leavingView}`}
        >
          {renderView(leavingView)}
        </div>
      )}
      <div
        className="add-context-panel"
        data-state={UI_STATE.entering}
        key={displayView}
      >
        {renderView(displayView)}
      </div>
    </div>
  );
}

export function AttachedTabCard({
  tab,
  onRemove,
}: {
  tab: AttachmentTab;
  onRemove: () => void;
}) {
  const t = useMessages();
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
