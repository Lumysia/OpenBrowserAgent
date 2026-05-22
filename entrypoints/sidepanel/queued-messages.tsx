import { Pencil, Trash2 } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import { Button } from "../../src/ui/components";
import { IconTooltip } from "./icon-tooltip";
import type { QueuedMessage } from "./use-queued-messages";
import { useDeferredRemove } from "./use-deferred-remove";

export function QueuedMessages({
  t,
  messages,
  onDelete,
  onEdit,
}: {
  t: Messages;
  messages: QueuedMessage[];
  onDelete: (id: string) => void;
  onEdit: (message: QueuedMessage) => void;
}) {
  if (!messages.length) return null;

  return (
    <div className="queued-messages" aria-live="polite">
      <div className="queued-messages-header">
        <strong>{t.sidepanel.queuedMessages}</strong>
        <small>
          {t.sidepanel.queuedMessagesDescription.replace(
            "{count}",
            String(messages.length),
          )}
        </small>
      </div>
      {messages.map((message) => (
        <QueuedMessageRow
          key={message.id}
          t={t}
          message={message}
          onDelete={() => onDelete(message.id)}
          onEdit={() => onEdit(message)}
        />
      ))}
    </div>
  );
}

function QueuedMessageRow({
  t,
  message,
  onDelete,
  onEdit,
}: {
  t: Messages;
  message: QueuedMessage;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { removing, remove } = useDeferredRemove(onDelete);
  return (
    <div className={`queued-message ${removing ? "is-removing" : ""}`}>
      <span>{message.content}</span>
      <div className="queued-message-actions">
        <IconTooltip label={t.common.edit}>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil size={14} />
          </Button>
        </IconTooltip>
        <IconTooltip label={t.common.delete}>
          <Button variant="ghost" size="icon" onClick={remove}>
            <Trash2 size={14} />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}
