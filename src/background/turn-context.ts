import type { ChatMessage } from "../shared/types";

// The messages with notes about this turn (the working tab, the current
// time) added to the context of the latest message, when it is the user's.
// Only for this run; nothing is stored.
export function withTurnContext(
  messages: ChatMessage[],
  notes: Array<string | false | undefined>,
) {
  const added = notes.filter(Boolean).join("\n\n");
  const index = messages.length - 1;
  const message = messages[index];
  if (!added || message?.role !== "user") return messages;
  const context =
    typeof message.metadata?.context === "string"
      ? message.metadata.context
      : "";
  const next = [...messages];
  next[index] = {
    ...message,
    metadata: {
      ...message.metadata,
      context: [context, added].filter(Boolean).join("\n\n"),
    },
  };
  return next;
}
