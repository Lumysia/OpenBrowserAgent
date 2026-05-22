import { useEffect, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Messages } from "../../src/shared/i18n";
import type { Chat } from "../../src/shared/types";
import { Button } from "../../src/ui/components";
import { IconTooltip } from "./icon-tooltip";
import { useDeferredPresence } from "./use-deferred-remove";

const SCROLL_EDGE_THRESHOLD_PX = 24;

export function MessageJumpControls({
  t,
  currentChat,
  editingMessageId,
  messagesRef,
}: {
  t: Messages;
  currentChat?: Chat;
  editingMessageId?: string;
  messagesRef: RefObject<HTMLDivElement | null>;
}) {
  const [showScrollJumps, setShowScrollJumps] = useState(false);
  const visible = showScrollJumps && !editingMessageId;
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

  function scrollMessagesTo(position: "top" | "bottom") {
    const messagesElement = messagesRef.current;
    if (!messagesElement) return;
    messagesElement.scrollTo({
      top: position === "top" ? 0 : messagesElement.scrollHeight,
      behavior: "smooth",
    });
  }

  if (!presence.mounted) return null;

  return (
    <div
      className={`message-jump-controls${presence.removing ? " is-removing" : ""}`}
    >
      <IconTooltip label={t.sidepanel.scrollToTop} side="left">
        <Button
          className="message-jump-button"
          variant="secondary"
          size="icon"
          aria-label={t.sidepanel.scrollToTop}
          onClick={() => scrollMessagesTo("top")}
        >
          <ArrowUp size={15} />
        </Button>
      </IconTooltip>
      <IconTooltip label={t.sidepanel.scrollToBottom} side="left">
        <Button
          className="message-jump-button"
          variant="secondary"
          size="icon"
          aria-label={t.sidepanel.scrollToBottom}
          onClick={() => scrollMessagesTo("bottom")}
        >
          <ArrowDown size={15} />
        </Button>
      </IconTooltip>
    </div>
  );
}
