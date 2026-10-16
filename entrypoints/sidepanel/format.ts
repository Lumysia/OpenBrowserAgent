import { RELATIVE_TIME_MINUTE_MS } from "../../src/shared/config";
import { formatDateTime, formatNumber } from "../../src/shared/format";
import { formatCount, languageOf, type Messages } from "../../src/shared/i18n";
import type { ChatMeta } from "../../src/shared/types";

export function sortChatsNewestFirst<T extends ChatMeta>(chats: T[]) {
  return [...chats].sort(
    (a, b) =>
      Number(!!b.pinnedAt) - Number(!!a.pinnedAt) ||
      (b.pinnedAt || b.updatedAt || b.createdAt) -
        (a.pinnedAt || a.updatedAt || a.createdAt),
  );
}

export function formatMessageCount(t: Messages, count: number) {
  return formatCount(t.sidepanel.messageCount, count);
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
  const days = Math.round(hours / 24);
  if (days >= 7) return formatHistoryDate(languageOf(t), value);
  return formatToolMessage(t.sidepanel.relativeDaysAgo, {
    count: days,
  });
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

export function formatMessageTime(language: string, value: number) {
  return formatDateTime(language, value, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHistoryDate(language: string, value: number) {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return formatDateTime(language, value, {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
  });
}

// Token counts in K and M in every language, as models and providers state
// them ("128K context"); the locale's own compact forms (万, Mio.) would not
// match the numbers people compare them with.
export function formatTokenNumber(value: number) {
  return Math.abs(value) >= 10_000
    ? formatNumber("en-US", value, {
        notation: "compact",
        maximumSignificantDigits: 3,
      })
    : formatNumber("en-US", value);
}
