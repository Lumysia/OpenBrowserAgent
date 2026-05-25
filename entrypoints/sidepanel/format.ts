import {
  ESTIMATED_CHARS_PER_TOKEN,
  RELATIVE_TIME_MINUTE_MS,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type { Chat } from "../../src/shared/types";

export function sortChatsNewestFirst(chats: Chat[]) {
  return [...chats].sort(
    (a, b) =>
      Number(!!b.pinnedAt) - Number(!!a.pinnedAt) ||
      (b.pinnedAt || b.updatedAt || b.createdAt) -
        (a.pinnedAt || a.updatedAt || a.createdAt),
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
  const days = Math.round(hours / 24);
  if (days >= 7) return formatHistoryDate(value);
  return formatToolMessage(t.sidepanel.relativeDaysAgo, {
    count: days,
  });
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function xmlTag(name: string, value: string | number) {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

export function xmlBlock(name: string, lines: Array<string | undefined>) {
  return [`<${name}>`, ...lines.filter(Boolean), `</${name}>`].join("\n");
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

export function formatMessageTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatHistoryDate(value: number) {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatEstimatedTokens(chars: number, t: Messages) {
  return formatToolMessage(t.sidepanel.runInfo.estimatedTokenCount, {
    count: formatCompactNumber(Math.ceil(chars / ESTIMATED_CHARS_PER_TOKEN)),
  });
}

export function formatCompactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000_000)
    return `${trimCompact(value / 1_000_000_000)}B`;
  if (Math.abs(value) >= 1_000_000) return `${trimCompact(value / 1_000_000)}M`;
  if (Math.abs(value) >= 10_000) return `${trimCompact(value / 1_000)}K`;
  return value.toLocaleString();
}

function trimCompact(value: number) {
  return value
    .toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)
    .replace(/\.0+$/, "");
}
