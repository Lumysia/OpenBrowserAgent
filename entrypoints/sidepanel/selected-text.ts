import {
  SIDE_PANEL_TASK,
  type SidePanelHandoff,
} from "../../src/shared/side-panel-handoff";
import type { AttachmentTab, SelectedText } from "../../src/shared/types";

const EXCERPT_CHARS = 120;

// The selection a handoff brings, tied to the page's tab when that tab goes
// with the message.
export function handoffSelectedText(
  handoff: SidePanelHandoff,
  tab: AttachmentTab | null,
): SelectedText | undefined {
  const text =
    handoff.task === SIDE_PANEL_TASK.ask ||
    handoff.task === SIDE_PANEL_TASK.searchWeb
      ? handoff.text?.trim()
      : "";
  if (!text) return undefined;
  return {
    text,
    ...(tab ? { tabId: tab.id } : {}),
    ...(handoff.pageTitle ? { pageTitle: handoff.pageTitle } : {}),
    ...(handoff.pageUrl ? { pageUrl: handoff.pageUrl } : {}),
  };
}

// Adds a selection; the same text from the same page is not added twice.
export function addSelectedText(items: SelectedText[], item: SelectedText) {
  return [
    ...items.filter(
      (other) => other.text !== item.text || other.pageUrl !== item.pageUrl,
    ),
    item,
  ];
}

// The start of the text on one line, for card and chip titles.
export function selectedTextExcerpt(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > EXCERPT_CHARS
    ? `${line.slice(0, EXCERPT_CHARS - 1)}…`
    : line;
}
