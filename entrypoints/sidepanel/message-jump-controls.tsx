import { useEffect, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat } from "../../src/shared/types";
import { Button, IconTooltip } from "../../src/ui/components";
import { hasUnfinishedAssistantRun, type StoppedRuns } from "./run-state";
import { useDeferredPresence } from "./use-deferred-remove";
import { cn } from "../../src/ui/utils";

const SCROLL_EDGE_THRESHOLD_PX = 24;
const JUMP_GAP_PX = 12;

export function MessageJumpControls({
  t,
  currentChat,
  editingMessageId,
  messagesRef,
  stoppedRuns,
}: {
  t: Messages;
  currentChat?: Chat;
  editingMessageId?: string;
  messagesRef: RefObject<HTMLDivElement | null>;
  stoppedRuns: StoppedRuns;
}) {
  const [showScrollJumps, setShowScrollJumps] = useState(false);
  const visible =
    showScrollJumps &&
    !editingMessageId &&
    !hasUnfinishedAssistantRun(currentChat, stoppedRuns);
  const presence = useDeferredPresence(visible);

  useEffect(() => {
    const messagesElement = messagesRef.current;
    if (!messagesElement) {
      setShowScrollJumps(false);
      return;
    }
    const element = messagesElement;

    let frame: number | undefined;
    function updateScrollJumps() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const distanceFromBottom =
          element.scrollHeight - element.scrollTop - element.clientHeight;
        setShowScrollJumps(
          element.scrollTop > SCROLL_EDGE_THRESHOLD_PX &&
            distanceFromBottom > SCROLL_EDGE_THRESHOLD_PX,
        );
      });
    }

    updateScrollJumps();
    element.addEventListener("scroll", updateScrollJumps, {
      passive: true,
    });
    const resizeObserver = new ResizeObserver(updateScrollJumps);
    resizeObserver.observe(element);
    if (element.firstElementChild) {
      resizeObserver.observe(element.firstElementChild);
    }

    return () => {
      element.removeEventListener("scroll", updateScrollJumps);
      resizeObserver.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [currentChat?.id, currentChat?.messages.length, messagesRef]);

  // Step between the user's own messages; past the first or last one, go to
  // the very top or bottom.
  function jump(direction: "previous" | "next") {
    const element = messagesRef.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top;
    const offsets = [...element.querySelectorAll(".message.user")].map(
      (message) =>
        message.getBoundingClientRect().top -
        top +
        element.scrollTop -
        JUMP_GAP_PX,
    );
    const current = element.scrollTop;
    const target =
      direction === "previous"
        ? (offsets.filter((offset) => offset < current - 1).pop() ?? 0)
        : (offsets.find((offset) => offset > current + 1) ??
          element.scrollHeight);
    element.scrollTo({ top: target, behavior: "smooth" });
  }

  if (!presence.mounted) return null;

  return (
    <div
      className={cn(
        "message-jump-controls",
        presence.removing && "is-removing",
      )}
    >
      <IconTooltip label={t.sidepanel.previousUserMessage} side="left">
        <Button
          className="message-jump-button"
          variant="secondary"
          size="icon"
          aria-label={t.sidepanel.previousUserMessage}
          onClick={() => jump("previous")}
        >
          <ArrowUp size={15} />
        </Button>
      </IconTooltip>
      <IconTooltip label={t.sidepanel.nextUserMessage} side="left">
        <Button
          className="message-jump-button"
          variant="secondary"
          size="icon"
          aria-label={t.sidepanel.nextUserMessage}
          onClick={() => jump("next")}
        >
          <ArrowDown size={15} />
        </Button>
      </IconTooltip>
    </div>
  );
}
