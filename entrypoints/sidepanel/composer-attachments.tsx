import { FileText, MousePointerClick, X } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { getSkillDisplayName } from "../../src/shared/skills";
import { Button } from "../../src/ui/components";
import { AttachedTabCard } from "./composer-menus";
import { IconTooltip } from "./icon-tooltip";
import { UploadedAttachmentCard } from "./uploaded-attachment-card";

export function ComposerAttachments({
  t,
  attachedTabs,
  pendingAttachments,
  selectedSkill,
  selectedElements,
  attachmentNotice,
  onRemoveAttachedTab,
  onRemoveUploadedAttachment,
  onClearSkill,
  onSetSelectedElements,
}: {
  t: Messages;
  attachedTabs: AttachmentTab[];
  pendingAttachments: UploadedAttachment[];
  selectedSkill?: Skill | null;
  selectedElements: SelectedElement[];
  attachmentNotice: string;
  onRemoveAttachedTab: (tabId: number) => void;
  onRemoveUploadedAttachment: (id: string) => void;
  onClearSkill: () => void;
  onSetSelectedElements: (value: SelectedElement[]) => void;
}) {
  return (
    <div className="context-strip">
      <div className="context-chip-row">
        {selectedSkill && (
          <div className="context-card">
            <FileText size={18} />
            <span>
              <strong>{getSkillDisplayName(selectedSkill)}</strong>
              <small>{selectedSkill.description || t.options.skills}</small>
            </span>
            <IconTooltip label={t.common.cancel}>
              <Button
                variant="ghost"
                size="icon"
                className="context-close"
                aria-label={t.common.cancel}
                onClick={onClearSkill}
              >
                <X size={14} />
              </Button>
            </IconTooltip>
          </div>
        )}
        {attachedTabs.map((tab) => (
          <AttachedTabCard
            key={tab.id}
            t={t}
            tab={tab}
            onRemove={() => onRemoveAttachedTab(tab.id)}
          />
        ))}
        {selectedElements.map((element, index) => (
          <div className="context-card" key={element.aiId || index}>
            <MousePointerClick size={18} />
            <span>
              <strong>{element.tagName || t.sidepanel.elementSelected}</strong>
              <small>{t.sidepanel.willBeSentAsPageContext}</small>
            </span>
            <IconTooltip label={t.common.cancel}>
              <Button
                variant="ghost"
                size="icon"
                className="context-close"
                aria-label={t.common.cancel}
                onClick={() =>
                  onSetSelectedElements(
                    selectedElements.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  )
                }
              >
                <X size={14} />
              </Button>
            </IconTooltip>
          </div>
        ))}
      </div>
      {!!pendingAttachments.length && (
        <div className="context-file-row">
          {pendingAttachments.map((attachment) => (
            <UploadedAttachmentCard
              key={attachment.id}
              t={t}
              attachment={attachment}
              onRemove={() => onRemoveUploadedAttachment(attachment.id)}
            />
          ))}
        </div>
      )}
      {attachmentNotice && (
        <div className="attachment-notice">{attachmentNotice}</div>
      )}
    </div>
  );
}
