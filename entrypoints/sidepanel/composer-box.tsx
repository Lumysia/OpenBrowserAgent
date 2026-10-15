import { Plus, Send, Square } from "lucide-react";
import type { ClipboardEvent } from "react";
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
import { ADD_MENU_VIEW, COMPOSER_MENU } from "./sidepanel-menu-state";
import { useChat, useComposer } from "./sidepanel-providers";
import { SkillPickerList, useSlashSkillPicker } from "./skill-picker";
import { useMessages } from "../../src/ui/messages";

const SLASH_PICKER_ID = "slash-skill-picker";

export function ComposerBox({
  // Opens the file picker for attachments.
  onPickFiles,
}: {
  onPickFiles: () => void;
}) {
  const t = useMessages();
  const { streaming, editingMessageId, cancelEditMessage } = useChat();
  const {
    input,
    setInput,
    composerRef,
    openMenu,
    setOpenMenu,
    setAddMenuView,
    skills,
    pickSkill,
    attachFiles,
    send,
    stop,
  } = useComposer();

  function attachFromClipboard(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter(
      (file) => file.size > 0,
    );
    if (!files.length) return;
    event.preventDefault();
    attachFiles(files).catch(() => undefined);
  }

  const slash = useSlashSkillPicker({
    input,
    skills,
    onPick: (skill) => {
      pickSkill(skill);
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
            onChange={(event) => setInput(event.target.value)}
            onPaste={attachFromClipboard}
            onKeyDown={(event) => {
              if (slash.onKeyDown(event)) return;
              if (
                event.key === "Escape" &&
                editingMessageId &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                cancelEditMessage();
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
                send();
              }
            }}
          />
          <div className="composer-controls">
            <div className="composer-left">
              <Popover
                open={openMenu === COMPOSER_MENU.add}
                onOpenChange={(open) => {
                  if (open) {
                    setAddMenuView(ADD_MENU_VIEW.menu);
                    setOpenMenu(COMPOSER_MENU.add);
                  } else {
                    setOpenMenu(null);
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
                        disabled={streaming}
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
                  <AddContextMenu onPickFiles={onPickFiles} />
                </PopoverContent>
              </Popover>
            </div>
            <ComposerSelectors />
            {streaming ? (
              <>
                <IconTooltip label={t.sidepanel.stop}>
                  <Button
                    className="send-button stop-button"
                    variant="secondary"
                    aria-label={t.sidepanel.stop}
                    onClick={stop}
                  >
                    <Square size={18} />
                  </Button>
                </IconTooltip>
                <IconTooltip label={t.sidepanel.queueMessage}>
                  <Button
                    className="send-button"
                    aria-label={t.sidepanel.queueMessage}
                    onClick={send}
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
                  onClick={send}
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
