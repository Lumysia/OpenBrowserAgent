import type { Messages } from "../../src/shared/i18n";
import { Button, Feedback, Skeleton } from "../../src/ui/components";
import type { CurrentChatStatus } from "./use-current-chat";
import { HolidayBadge } from "./holiday-touches";

// Shown in place of the messages: while the open chat's content loads, when
// it could not be loaded, or when the chat has no messages yet.
export function ChatContentStatus({
  t,
  status,
  empty,
  onRetry,
}: {
  t: Messages;
  status: CurrentChatStatus;
  empty: boolean;
  onRetry: () => void;
}) {
  if (status === "ready")
    return empty ? (
      <div className="empty">
        <div>
          <HolidayBadge t={t} />
          <h2>{t.sidepanel.whatDoYouWant}</h2>
          <p className="muted">{t.sidepanel.emptyDescription}</p>
        </div>
      </div>
    ) : null;
  if (status === "error" || status === "unavailable")
    return (
      <div className="chat-content-status">
        <Feedback error>
          {status === "error"
            ? t.sidepanel.chatLoadFailed
            : t.sidepanel.chatUnavailable}
        </Feedback>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t.sidepanel.retryLoadChat}
        </Button>
      </div>
    );
  return (
    <div className="chat-content-status" aria-busy="true">
      <Feedback className="visually-hidden">{t.sidepanel.chatLoading}</Feedback>
      <Skeleton className="chat-content-skeleton" />
      <Skeleton className="chat-content-skeleton short" />
      <Skeleton className="chat-content-skeleton" />
    </div>
  );
}
