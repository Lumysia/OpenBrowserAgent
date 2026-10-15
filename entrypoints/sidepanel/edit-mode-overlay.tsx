import { Pencil, X } from "lucide-react";
import { Button } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

export function EditModeOverlay({ onCancel }: { onCancel: () => void }) {
  const t = useMessages();
  return (
    <div className="edit-mode-shield" aria-live="polite">
      <div className="edit-mode-banner">
        <Pencil size={16} />
        <span>
          <strong>{t.sidepanel.editingMessage}</strong>
          <small>{t.sidepanel.editingMessageDescription}</small>
        </span>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          <X size={15} /> {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
