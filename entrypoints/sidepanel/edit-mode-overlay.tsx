import { Pencil, X } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { Button } from "../../src/ui/components";

export function EditModeOverlay({
  t,
  onCancel,
}: {
  t: Messages;
  onCancel: () => void;
}) {
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
