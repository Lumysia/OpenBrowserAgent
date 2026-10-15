import type { ChatMessage, ChatPart, RunMetrics } from "./types";

// How a reply's run ended (RunMetrics.stopReason). Replies stored before it
// was recorded have none and count as finished.
export const RUN_STOP_REASON = {
  finished: "finished",
  // The model reached its output limit.
  length: "length",
  aborted: "aborted",
  error: "error",
} as const;

export type RunStopReason =
  (typeof RUN_STOP_REASON)[keyof typeof RUN_STOP_REASON];

export type CutReason = Exclude<RunStopReason, "finished">;

// A "notice" part keeps what the run reported about the reply, apart from
// its text, so the panel, the export and the next request all see it.
export const CHAT_NOTICE_KIND = { error: "error" } as const;

export type ChatNoticeKind =
  (typeof CHAT_NOTICE_KIND)[keyof typeof CHAT_NOTICE_KIND];

// One error per run end; the id keeps a repeated end (the panel and the
// background both record a sub-agent's) from adding it twice.
export function errorNoticePart(text: string): ChatPart {
  return {
    id: "run-error",
    type: "notice",
    kind: CHAT_NOTICE_KIND.error,
    text,
  };
}

function noticeParts(message: ChatMessage, kind: ChatNoticeKind) {
  return (message.parts || []).filter(
    (part) => part.type === "notice" && part.kind === kind,
  );
}

// A reply that ended before it was finished: why, and the errors it got.
export function replyCutOff(
  message: ChatMessage,
): { reason: CutReason; errors: string[] } | undefined {
  if (message.role !== "assistant") return undefined;
  const reason = (message.metadata?.runMetrics as RunMetrics | undefined)
    ?.stopReason;
  if (!reason || reason === RUN_STOP_REASON.finished) return undefined;
  return {
    reason,
    errors: noticeParts(message, CHAT_NOTICE_KIND.error)
      .map((part) => part.text || "")
      .filter(Boolean),
  };
}
