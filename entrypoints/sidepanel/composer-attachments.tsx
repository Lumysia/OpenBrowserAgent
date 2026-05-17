import { MousePointerClick, X } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  SelectedElement,
  UploadedAttachment,
} from "../../src/shared/types";
import { AttachedTabCard } from "./composer-menus";
import { UploadedAttachmentCard } from "./uploaded-attachment-card";

export function ComposerAttachments({
  t,
  attachedTabs,
  pendingAttachments,
  selectedElement,
  attachmentNotice,
  onRemoveAttachedTab,
  onRemoveUploadedAttachment,
  onSetSelectedElement,
}: {
  t: Messages;
  attachedTabs: AttachmentTab[];
  pendingAttachments: UploadedAttachment[];
  selectedElement: SelectedElement | null;
  attachmentNotice: string;
  onRemoveAttachedTab: (tabId: number) => void;
  onRemoveUploadedAttachment: (id: string) => void;
  onSetSelectedElement: (value: SelectedElement | null) => void;
}) {
  return (
    <div className="context-strip">
      <div className="context-chip-row">
        {attachedTabs.map((tab) => (
          <AttachedTabCard
            key={tab.id}
            t={t}
            tab={tab}
            onRemove={() => onRemoveAttachedTab(tab.id)}
          />
        ))}
        {pendingAttachments.map((attachment) => (
          <UploadedAttachmentCard
            key={attachment.id}
            t={t}
            attachment={attachment}
            onRemove={() => onRemoveUploadedAttachment(attachment.id)}
          />
        ))}
      </div>
      {attachmentNotice && (
        <div className="attachment-notice">{attachmentNotice}</div>
      )}
      {selectedElement && (
        <div className="context-card">
          <MousePointerClick size={18} />
          <span>
            <strong>
              {selectedElement.tagName || t.sidepanel.elementSelected}
            </strong>
            <small>{t.sidepanel.willBeSentAsPageContext}</small>
          </span>
          <button
            className="context-close"
            title={t.sidepanel.selectElement}
            onClick={() => onSetSelectedElement(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
