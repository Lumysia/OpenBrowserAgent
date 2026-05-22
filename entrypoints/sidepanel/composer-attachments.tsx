import { FileText, MousePointerClick, X } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  SelectedElement,
  Skill,
  UploadedAttachment,
} from "../../src/shared/types";
import { getSkillDisplayName } from "../../src/shared/skills";
import { Button, ScrollArea } from "../../src/ui/components";
import { AttachedTabCard } from "./composer-menus";
import { IconTooltip } from "./icon-tooltip";
import { UploadedAttachmentCard } from "./uploaded-attachment-card";
import { useDeferredRemove } from "./use-deferred-remove";

export function ComposerAttachments({
  t,
  attachedTabs,
  pendingAttachments,
  selectedSkills,
  selectedElements,
  attachmentNotice,
  onRemoveAttachedTab,
  onRemoveUploadedAttachment,
  onRemoveSkill,
  onSetSelectedElements,
}: {
  t: Messages;
  attachedTabs: AttachmentTab[];
  pendingAttachments: UploadedAttachment[];
  selectedSkills: Skill[];
  selectedElements: SelectedElement[];
  attachmentNotice: string;
  onRemoveAttachedTab: (tabId: number) => void;
  onRemoveUploadedAttachment: (id: string) => void;
  onRemoveSkill: (skillId: string) => void;
  onSetSelectedElements: (value: SelectedElement[]) => void;
}) {
  const hasSkillChips = selectedSkills.length > 0;
  const hasPageContextChips =
    attachedTabs.length > 0 || selectedElements.length > 0;

  return (
    <div className="context-strip">
      {hasSkillChips && (
        <ScrollArea className="context-chip-scroll" orientation="horizontal">
          <div className="context-chip-row">
            {selectedSkills.map((skill) => (
              <SkillContextCard
                key={skill.id}
                t={t}
                skill={skill}
                onRemove={() => onRemoveSkill(skill.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {hasPageContextChips && (
        <ScrollArea className="context-chip-scroll" orientation="horizontal">
          <div className="context-chip-row">
            {attachedTabs.map((tab) => (
              <AttachedTabCard
                key={tab.id}
                t={t}
                tab={tab}
                onRemove={() => onRemoveAttachedTab(tab.id)}
              />
            ))}
            {selectedElements.map((element, index) => (
              <SelectedElementContextCard
                key={element.aiId || index}
                t={t}
                element={element}
                onRemove={() =>
                  onSetSelectedElements(
                    selectedElements.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  )
                }
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {!!pendingAttachments.length && (
        <ScrollArea className="context-file-scroll" orientation="horizontal">
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
        </ScrollArea>
      )}
      {attachmentNotice && (
        <div className="attachment-notice">{attachmentNotice}</div>
      )}
    </div>
  );
}

function SkillContextCard({
  t,
  skill,
  onRemove,
}: {
  t: Messages;
  skill: Skill;
  onRemove: () => void;
}) {
  const { removing, remove } = useDeferredRemove(onRemove);
  return (
    <div className={`context-card ${removing ? "is-removing" : ""}`}>
      <FileText size={18} />
      <span>
        <strong>{getSkillDisplayName(skill)}</strong>
        <small>{skill.description || t.options.skills}</small>
      </span>
      <IconTooltip label={t.common.cancel}>
        <Button
          variant="ghost"
          size="icon"
          className="context-close"
          aria-label={t.common.cancel}
          onClick={remove}
        >
          <X size={14} />
        </Button>
      </IconTooltip>
    </div>
  );
}

function SelectedElementContextCard({
  t,
  element,
  onRemove,
}: {
  t: Messages;
  element: SelectedElement;
  onRemove: () => void;
}) {
  const { removing, remove } = useDeferredRemove(onRemove);
  return (
    <div className={`context-card ${removing ? "is-removing" : ""}`}>
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
          onClick={remove}
        >
          <X size={14} />
        </Button>
      </IconTooltip>
    </div>
  );
}
