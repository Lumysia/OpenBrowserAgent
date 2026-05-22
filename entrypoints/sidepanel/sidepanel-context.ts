import { isScriptableUrl } from "../../src/shared/browser";
import {
  ISO_DATE_LENGTH,
  LOCAL_CHAT_TITLE_MAX_LENGTH,
  SELECTED_ELEMENT_HTML_MAX_CHARS,
  TAB_CONTENT_MAX_CHARS,
} from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import type {
  AttachmentTab,
  Chat,
  SelectedElement,
} from "../../src/shared/types";
import { xmlBlock, xmlTag } from "./format";

export function interpolateSkillVariables(value: string) {
  const date = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  return value.replaceAll("{{ date }}", date);
}

export function generateLocalTitle(value: string, t: Messages) {
  const title = value.replace(/\s+/g, " ").trim();
  return title.length > LOCAL_CHAT_TITLE_MAX_LENGTH
    ? `${title.slice(0, LOCAL_CHAT_TITLE_MAX_LENGTH)}...`
    : title || t.words.newChat;
}

export function toAttachmentTab(tab: chrome.tabs.Tab): AttachmentTab | null {
  if (!tab.id || !isScriptableUrl(tab.url)) return null;
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    favIconUrl: tab.favIconUrl,
  };
}

export function isTabAlreadySentAsSelected(chats: Chat[], tabId: number) {
  return chats.some((chat) =>
    chat.messages.some((message) => {
      const selectedTabs = message.metadata?.attachedTabs;
      return (
        Array.isArray(selectedTabs) &&
        selectedTabs.some(
          (tab) =>
            typeof tab === "object" &&
            tab !== null &&
            (tab as AttachmentTab).id === tabId,
        )
      );
    }),
  );
}

export async function buildSidepanelContext({
  attachedTabs,
  selectedElements,
}: {
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
}) {
  const parts: string[] = [];
  selectedElements.forEach((element) =>
    parts.push(renderSelectedElement(element, attachedTabs)),
  );
  if (attachedTabs.length) {
    const tabBlocks = [];
    for (const tab of attachedTabs) tabBlocks.push(renderAttachedTab(tab));
    parts.push(xmlBlock("selected_tabs", tabBlocks));
  }
  return parts.join("\n\n");
}

function renderSelectedElement(
  selectedElement: SelectedElement,
  attachedTabs: AttachmentTab[],
) {
  return xmlBlock("selected_element", [
    selectedElement.aiId ? xmlTag("ai_id", selectedElement.aiId) : undefined,
    xmlTag("tab_id", attachedTabs[0]?.id || ""),
    selectedElement.tagName
      ? xmlTag("tag_name", selectedElement.tagName)
      : undefined,
    selectedElement.innerText
      ? xmlTag("inner_text", selectedElement.innerText)
      : undefined,
    xmlTag("value", selectedElement.value || ""),
    selectedElement.imageSrc
      ? xmlTag("image_src", selectedElement.imageSrc)
      : undefined,
    selectedElement.imageAlt
      ? xmlTag("image_alt", selectedElement.imageAlt)
      : undefined,
    selectedElement.imageWidth || selectedElement.imageHeight
      ? xmlTag(
          "image_size",
          `${selectedElement.imageWidth || ""}x${selectedElement.imageHeight || ""}`,
        )
      : undefined,
    selectedElement.imageDataUrl
      ? xmlTag(
          "image_attachment",
          "Selected image pixels are available as an image attachment in available_attachments.",
        )
      : undefined,
    selectedElement.outerHTML
      ? xmlTag(
          "outer_html",
          selectedElement.outerHTML.slice(0, SELECTED_ELEMENT_HTML_MAX_CHARS),
        )
      : undefined,
  ]);
}

function renderAttachedTab(tab: AttachmentTab) {
  return renderTabBlock(tab, "");
}

function renderTabBlock(tab: AttachmentTab, text: string) {
  return [
    xmlBlock("tab", [xmlTag("tab_id", tab.id)]),
    xmlTag("title", tab.title || ""),
    xmlTag("url", tab.url || ""),
    xmlTag("content", text ? text.slice(0, TAB_CONTENT_MAX_CHARS) : ""),
  ].join("\n");
}
