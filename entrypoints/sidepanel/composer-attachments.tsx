import { FileText, MousePointerClick, TextQuote } from "lucide-react";
import { ScrollArea } from "../../src/ui/components";
import { skillDisplay } from "../../src/ui/skill-display";
import { AttachedTabCard } from "./composer-menus";
import { ContextCard } from "./context-card";
import { useComposer } from "./sidepanel-providers";
import { selectedTextExcerpt } from "./selected-text";
import { UploadedAttachmentCard } from "./uploaded-attachment-card";
import { useMessages } from "../../src/ui/messages";

export function ComposerAttachments() {
  const t = useMessages();
  const {
    attachedTabs,
    pendingAttachments,
    selectedSkills,
    selectedElements,
    selectedTexts,
    attachmentNotice,
    removeAttachedTab,
    removeSelectedText,
    removeAttachment,
    removeSkill,
    setSelectedElements,
  } = useComposer();
  const hasSkillChips = selectedSkills.length > 0;
  const hasPageContextChips =
    attachedTabs.length > 0 ||
    selectedElements.length > 0 ||
    selectedTexts.length > 0;

  return (
    <div className="context-strip">
      {hasSkillChips && (
        <ScrollArea
          className="context-chip-scroll"
          orientation="horizontal"
          inset
        >
          <div className="context-chip-row">
            {selectedSkills.map((skill) => {
              const { name, description } = skillDisplay(skill, t);
              return (
                <ContextCard
                  key={skill.id}
                  icon={<FileText size={18} />}
                  title={name}
                  detail={description || t.options.skills}
                  removeLabel={t.common.cancel}
                  onRemove={() => removeSkill(skill.id)}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}
      {hasPageContextChips && (
        <ScrollArea
          className="context-chip-scroll"
          orientation="horizontal"
          inset
        >
          <div className="context-chip-row">
            {attachedTabs.map((tab) => (
              <AttachedTabCard
                key={tab.id}
                tab={tab}
                onRemove={() => removeAttachedTab(tab.id)}
              />
            ))}
            {selectedElements.map((element, index) => (
              <ContextCard
                key={element.ref || index}
                icon={<MousePointerClick size={18} />}
                title={element.tagName || t.sidepanel.elementSelected}
                detail={t.sidepanel.willBeSentAsPageContext}
                removeLabel={t.common.cancel}
                onRemove={() =>
                  setSelectedElements(
                    selectedElements.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  )
                }
              />
            ))}
            {selectedTexts.map((selection) => (
              <ContextCard
                key={`${selection.pageUrl}:${selection.text}`}
                icon={<TextQuote size={18} />}
                title={selectedTextExcerpt(selection.text)}
                fullTitle={selection.text}
                detail={`${t.sidepanel.selectedText} · ${t.sidepanel.willBeSentWithMessage}`}
                removeLabel={t.sidepanel.removeSelectedText}
                onRemove={() => removeSelectedText(selection)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {!!pendingAttachments.length && (
        <ScrollArea
          className="context-file-scroll"
          orientation="horizontal"
          inset
        >
          <div className="context-file-row">
            {pendingAttachments.map((attachment) => (
              <UploadedAttachmentCard
                key={attachment.id}
                attachment={attachment}
                onRemove={() => removeAttachment(attachment.id)}
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
