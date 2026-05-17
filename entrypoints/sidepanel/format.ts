import { RELATIVE_TIME_MINUTE_MS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type { Chat } from "../../src/shared/types";

export function sortChatsNewestFirst(chats: Chat[]) {
  return [...chats].sort(
    (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
  );
}

export function formatMessageCount(t: Messages, count: number) {
  return formatToolMessage(t.sidepanel.messageCount, { count });
}

export function formatRelativeTime(t: Messages, value: number) {
  const diff = Date.now() - value;
  const minutes = Math.max(1, Math.round(diff / RELATIVE_TIME_MINUTE_MS));
  if (minutes < 60)
    return formatToolMessage(t.sidepanel.relativeMinutesAgo, {
      count: minutes,
    });
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return formatToolMessage(t.sidepanel.relativeHoursAgo, { count: hours });
  return formatToolMessage(t.sidepanel.relativeDaysAgo, {
    count: Math.round(hours / 24),
  });
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatToolMessage(
  template: string | undefined,
  values: Record<string, string | number>,
) {
  if (!template) return "";
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
