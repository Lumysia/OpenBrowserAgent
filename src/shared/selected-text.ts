import type { SelectedText } from "./types";
import { xmlBlock, xmlTag } from "./xml";

// The selections a sent message carries; older messages have none.
export function selectedTextsFromMetadata(
  metadata: Record<string, unknown> | undefined,
): SelectedText[] {
  const items = metadata?.selectedTexts;
  return Array.isArray(items)
    ? items.filter(
        (item): item is SelectedText =>
          !!item &&
          typeof item === "object" &&
          typeof (item as SelectedText).text === "string",
      )
    : [];
}

// Text the user selected on a page, with the page it came from, as the
// agent gets it.
export function renderSelectedText(selection: SelectedText) {
  return xmlBlock("selected_text", [
    selection.tabId !== undefined
      ? xmlTag("tab_id", selection.tabId)
      : undefined,
    selection.pageTitle ? xmlTag("title", selection.pageTitle) : undefined,
    selection.pageUrl ? xmlTag("url", selection.pageUrl) : undefined,
    xmlTag("text", selection.text),
  ]);
}
