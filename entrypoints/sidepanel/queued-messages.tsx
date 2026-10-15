import { Pencil, Trash2 } from "lucide-react";
import { formatCount } from "../../src/shared/i18n";
import { Button, IconTooltip, UserText } from "../../src/ui/components";
import type { QueuedMessage } from "./use-queued-messages";
import { useDeferredRemove } from "./use-deferred-remove";
import { cn } from "../../src/ui/utils";
import { useMessages } from "../../src/ui/messages";

export function QueuedMessages({
  messages,
  onDelete,
  onEdit,
}: {
  messages: QueuedMessage[];
  onDelete: (id: string) => void;
  onEdit: (message: QueuedMessage) => void;
}) {
  const t = useMessages();
  if (!messages.length) return null;

  return (
    <div className="composer-card" aria-live="polite">
      <div className="composer-card-header">
        <strong>{t.sidepanel.queuedMessages}</strong>
        <small>
          {formatCount(t.sidepanel.queuedMessagesDescription, messages.length)}
        </small>
      </div>
      {messages.map((message) => (
        <QueuedMessageRow
          key={message.id}
          message={message}
          onDelete={() => onDelete(message.id)}
          onEdit={() => onEdit(message)}
        />
      ))}
    </div>
  );
}

function QueuedMessageRow({
  message,
  onDelete,
  onEdit,
}: {
  message: QueuedMessage;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const t = useMessages();
  const { removing, remove } = useDeferredRemove(onDelete);
  return (
    <div className={cn("queued-message", removing && "is-removing")}>
      <UserText className="queued-message-text" text={message.content} />
      <div className="queued-message-actions">
        <IconTooltip label={t.common.edit}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.common.edit}
            onClick={onEdit}
          >
            <Pencil size={14} />
          </Button>
        </IconTooltip>
        <IconTooltip label={t.common.delete}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.common.delete}
            onClick={remove}
          >
            <Trash2 size={14} />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}
