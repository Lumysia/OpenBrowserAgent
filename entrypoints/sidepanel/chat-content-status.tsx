import {
  Button,
  EMPTY_STATE_VARIANT,
  EmptyState,
  Feedback,
  Skeleton,
} from "../../src/ui/components";
import type { CurrentChatStatus } from "./use-current-chat";
import { HolidayBadge } from "./holiday-touches";
import { useMessages } from "../../src/ui/messages";

// Shown in place of the messages: while the open chat's content loads, when
// it could not be loaded, or when the chat has no messages yet.
export function ChatContentStatus({
  status,
  empty,
  onRetry,
}: {
  status: CurrentChatStatus;
  empty: boolean;
  onRetry: () => void;
}) {
  const t = useMessages();
  if (status === "ready")
    return empty ? (
      <EmptyState
        variant={EMPTY_STATE_VARIANT.hero}
        lead={<HolidayBadge />}
        title={t.sidepanel.whatDoYouWant}
        description={t.sidepanel.emptyDescription}
      />
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
