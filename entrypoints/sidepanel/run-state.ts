import {
  CHAT_PART_STATE,
  type Chat,
  type ChatMessage,
} from "../../src/shared/types";

// Whether a reply's run is over. A reply stored without an end whose run the
// background does not have (it died, or ran on another device) is over too;
// the panel learns that when it reattaches and keeps it in `stopped`
// instead of storing an end, which would change a message no one changed.

export type StoppedRuns = ReadonlySet<string>;

export const NO_STOPPED_RUNS: StoppedRuns = new Set();

function startedWithoutEnd(message: ChatMessage) {
  const metrics = message.metadata?.runMetrics as
    { startedAt?: unknown; endedAt?: unknown } | undefined;
  return (
    message.role === "assistant" &&
    metrics?.startedAt !== undefined &&
    metrics.endedAt === undefined
  );
}

export function messageRunEnded(message: ChatMessage, stopped: boolean) {
  const metrics = message.metadata?.runMetrics as { endedAt?: unknown };
  return (
    stopped ||
    !!metrics?.endedAt ||
    !!message.parts?.some((part) => part.state === CHAT_PART_STATE.outputError)
  );
}

// The latest reply whose run may still be going in the background.
export function resumableAssistantMessage(chat: Chat, stopped: StoppedRuns) {
  return [...chat.messages]
    .reverse()
    .find((message) => startedWithoutEnd(message) && !stopped.has(message.id));
}

export function hasUnfinishedAssistantRun(
  chat: Chat | undefined,
  stopped: StoppedRuns,
) {
  return !!chat?.messages.some(
    (message) => startedWithoutEnd(message) && !stopped.has(message.id),
  );
}
