import type { ChatMessage } from "../../src/shared/types";

export function assistantMessageText(message: ChatMessage) {
  if (message.role !== "assistant") return "";
  const contentFallback = assistantMessageContentFallback(message);
  const partText = assistantPartText(message);
  return [contentFallback, partText].filter(Boolean).join("").trim();
}

// Reply text kept only in `content` (replies stored before parts, or
// older replies with an error appended), shown above the parts.
export function assistantMessageContentFallback(message: ChatMessage) {
  const content = message.content.trim();
  if (message.role !== "assistant" || !content || !message.parts?.length)
    return !message.parts?.length ? content : "";
  const partText = assistantPartText(message).trim();
  return partText.includes(content) ? "" : content;
}

function assistantPartText(message: ChatMessage) {
  return (message.parts || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("")
    .trim();
}
