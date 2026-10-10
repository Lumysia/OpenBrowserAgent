import { getBrowserApi } from "./browser-api";

export const ABORT_CHAT_STREAMS = "ai-stream.abort-chats";

export type AbortChatStreamsRequest = {
  type: typeof ABORT_CHAT_STREAMS;
  chatIds: string[];
};

export type AbortChatStreamsResponse =
  { ok: true } | { ok: false; error: string };

// Closing a chat owns cancellation by chat ID, including background sessions
// retained after a panel disconnect. Ordinary Stop remains port-owned.
export async function abortChatStreams(chatIds: Iterable<string>) {
  const response: AbortChatStreamsResponse | undefined =
    await getBrowserApi().runtime.sendMessage({
      type: ABORT_CHAT_STREAMS,
      chatIds: [...chatIds],
    } satisfies AbortChatStreamsRequest);
  if (!response?.ok)
    throw new Error(
      response?.error || "Chat stream cancellation was not acknowledged.",
    );
}
