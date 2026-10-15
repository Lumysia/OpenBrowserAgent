import { sendRuntimeRequest } from "./runtime-messages";

export const ABORT_CHAT_STREAMS = "ai-stream.abort-chats";

type AbortChatStreamsRequest = {
  type: typeof ABORT_CHAT_STREAMS;
  chatIds: string[];
};

// Closing a chat owns cancellation by chat ID, including background sessions
// retained after a panel disconnect. Ordinary Stop remains port-owned.
export async function abortChatStreams(chatIds: Iterable<string>) {
  await sendRuntimeRequest<void>(
    {
      type: ABORT_CHAT_STREAMS,
      chatIds: [...chatIds],
    } satisfies AbortChatStreamsRequest,
    "Chat stream cancellation",
  );
}
