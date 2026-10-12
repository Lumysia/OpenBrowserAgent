import { Plus, Send, Square } from "lucide-react";
import type { ClipboardEvent, RefObject } from "react";
import type { Messages } from "../../src/shared/i18n";
import type {
  Agent,
  AttachmentTab,
  ModelConfig,
  PickedSkill,
  Preferences,
} from "../../src/shared/types";
import {
  Button,
  IconTooltip,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { AddContextMenu } from "./composer-menus";
import { ComposerSelectors } from "./composer-selectors";
import {
  ADD_MENU_VIEW,
  COMPOSER_MENU,
  type AddMenuView,
  type ComposerMenu,
} from "./sidepanel-menu-state";
import { SkillPickerList, useSlashSkillPicker } from "./skill-picker";

const SLASH_PICKER_ID = "slash-skill-picker";

export function ComposerBox({
  t,
  input,
  composerRef,
  editingMessageId,
  aiWorking,
  streaming,
  openMenu,
  addMenuView,
  availableTabs,
  attachedTabs,
  activeTabAttachable,
  skills,
  selectedSkills,
  preferences,
  configuredModels,
  agents,
  onSetInput,
  onPaste,
  onCancelEditMessage,
  onSend,
  onStop,
  onSetOpenMenu,
  onSetAddMenuView,
  onShowAllTabsPicker,
  onToggleSkill,
  onPickSkill,
  onToggleAttachedTab,
  onAttachActiveTab,
  onAttachFiles,
  onSelectElement,
  onSetPreferences,
}: {
  t: Messages;
  input: string;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  editingMessageId?: string;
  aiWorking: boolean;
  streaming: boolean;
  openMenu: ComposerMenu | null;
  addMenuView: AddMenuView;
  availableTabs: AttachmentTab[];
  attachedTabs: AttachmentTab[];
  activeTabAttachable: boolean;
  skills: PickedSkill[];
  selectedSkills: PickedSkill[];
  preferences?: Preferences;
  configuredModels: ModelConfig[];
  agents: Agent[];
  onSetInput: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onCancelEditMessage: () => void;
  onSend: () => void;
  onStop: () => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetAddMenuView: (value: AddMenuView) => void;
  onShowAllTabsPicker: () => void;
  onToggleSkill: (skill: PickedSkill) => void;
  // A skill picked from the "/" list, replacing the "/query" typed so far.
  onPickSkill: (skill: PickedSkill) => void;
  onToggleAttachedTab: (tab: AttachmentTab) => void;
  onAttachActiveTab: () => Promise<void>;
  onAttachFiles: () => void;
  onSelectElement: () => Promise<void>;
  onSetPreferences: (
    value: Preferences | ((previous: Preferences) => Preferences),
  ) => void;
}) {
  const slash = useSlashSkillPicker({
    input,
    skills,
    onPick: (skill) => {
      onPickSkill(skill);
      composerRef.current?.focus();
    },
  });

  return (
    <Popover
      open={slash.open}
      onOpenChange={(open) => !open && slash.dismiss()}
    >
      <PopoverAnchor asChild>
        <div className="composer-box">
          <Textarea
            ref={composerRef}
            value={input}
            aria-label={t.sidepanel.whatDoYouWant}
            placeholder={t.sidepanel.whatDoYouWant}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={slash.open}
            aria-controls={slash.open ? SLASH_PICKER_ID : undefined}
            aria-activedescendant={
              slash.open && slash.matches.length
                ? `${SLASH_PICKER_ID}-${slash.activeIndex}`
                : undefined
            }
            onChange={(event) => onSetInput(event.target.value)}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (slash.onKeyDown(event)) return;
              if (
                event.key === "Escape" &&
                editingMessageId &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                onCancelEditMessage();
                return;
              }
              if (
                event.key === "Enter" &&
                !event.nativeEvent.isComposing &&
                !event.shiftKey &&
                !event.metaKey &&
                !event.ctrlKey
              ) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <div className="composer-controls">
            <div className="composer-left">
              <Popover
                open={openMenu === COMPOSER_MENU.add}
                onOpenChange={(open) => {
                  if (open) {
                    onSetAddMenuView(ADD_MENU_VIEW.menu);
                    onSetOpenMenu(COMPOSER_MENU.add);
                  } else {
                    onSetOpenMenu(null);
                  }
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        className="composer-icon-button"
                        variant="outline"
                        size="icon"
                        aria-label={t.common.add}
                        disabled={aiWorking}
                      >
                        <Plus size={20} />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t.common.add}</TooltipContent>
                </Tooltip>
                <PopoverContent
                  side="top"
                  align="start"
                  className="add-context-popover-content"
                >
                  <AddContextMenu
                    t={t}
                    view={addMenuView}
                    tabs={availableTabs}
                    skills={skills}
                    selectedSkillIds={selectedSkills.map((skill) => skill.id)}
                    selectedTabIds={attachedTabs.map((tab) => tab.id)}
                    activeTabAttachable={activeTabAttachable}
                    onShowTabs={onShowAllTabsPicker}
                    onShowSkills={() => onSetAddMenuView(ADD_MENU_VIEW.skills)}
                    onSkill={onToggleSkill}
                    onUploadFiles={() => {
                      onAttachFiles();
                      onSetOpenMenu(null);
                    }}
                    onToggleTab={onToggleAttachedTab}
                    onAttachTab={async () => {
                      await onAttachActiveTab();
                      onSetOpenMenu(null);
                    }}
                    onSelectElement={async () => {
                      await onSelectElement();
                      onSetOpenMenu(null);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <ComposerSelectors
              t={t}
              preferences={preferences}
              configuredModels={configuredModels}
              agents={agents}
              openMenu={openMenu}
              aiWorking={aiWorking}
              onSetOpenMenu={onSetOpenMenu}
              onSetPreferences={onSetPreferences}
            />
            {streaming ? (
              <>
                <IconTooltip label={t.sidepanel.stop}>
                  <Button
                    className="send-button stop-button"
                    variant="secondary"
                    aria-label={t.sidepanel.stop}
                    onClick={onStop}
                  >
                    <Square size={18} />
                  </Button>
                </IconTooltip>
                <IconTooltip label={t.sidepanel.queueMessage}>
                  <Button
                    className="send-button"
                    aria-label={t.sidepanel.queueMessage}
                    onClick={() => onSend()}
                  >
                    <Send size={20} />
                  </Button>
                </IconTooltip>
              </>
            ) : (
              <IconTooltip label={t.sidepanel.send}>
                <Button
                  className="send-button"
                  aria-label={t.sidepanel.send}
                  onClick={() => onSend()}
                >
                  <Send size={20} />
                </Button>
              </IconTooltip>
            )}
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="add-context-popover-content slash-skill-popover-content"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (composerRef.current?.contains(event.target as Node))
            event.preventDefault();
        }}
      >
        <div className="add-context-menu">
          <SkillPickerList
            t={t}
            id={SLASH_PICKER_ID}
            skills={slash.matches}
            activeIndex={slash.activeIndex}
            onHover={slash.setActiveIndex}
            onPick={slash.pick}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
