import {
  extractTabText,
  getActiveTab,
  isScriptableUrl,
} from "../../src/shared/browser";
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
  ChatMode,
  SelectedElement,
} from "../../src/shared/types";
import { isAskMode } from "../../src/shared/types";
import { escapeXml } from "./format";

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
  mode,
  attachedTabs,
  selectedElement,
}: {
  mode: ChatMode;
  attachedTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
}) {
  const parts: string[] = [];
  if (selectedElement)
    parts.push(renderSelectedElement(selectedElement, attachedTabs));
  if (attachedTabs.length) {
    const tabBlocks = [];
    for (const tab of attachedTabs)
      tabBlocks.push(await renderAttachedTab(tab, mode));
    parts.push(`<selected_tabs>\n${tabBlocks.join("\n")}\n</selected_tabs>`);
  } else {
    const tab = await getActiveTab();
    if (tab?.id && isScriptableUrl(tab.url))
      parts.push(
        `<current_tab>\n<id>${tab.id}</id>\n<title>${escapeXml(tab.title || "")}</title>\n<url>${escapeXml(tab.url || "")}</url>\n</current_tab>`,
      );
  }
  return parts.join("\n\n");
}

function renderSelectedElement(
  selectedElement: SelectedElement,
  attachedTabs: AttachmentTab[],
) {
  return [
    "<selected_element>",
    selectedElement.aiId ? `<ai_id>${selectedElement.aiId}</ai_id>` : undefined,
    `<tab_id>${attachedTabs[0]?.id || ""}</tab_id>`,
    selectedElement.tagName
      ? `<tag_name>${escapeXml(selectedElement.tagName)}</tag_name>`
      : undefined,
    selectedElement.innerText
      ? `<inner_text>${escapeXml(selectedElement.innerText)}</inner_text>`
      : undefined,
    `<value>${escapeXml(selectedElement.value || "")}</value>`,
    selectedElement.imageSrc
      ? `<image_src>${escapeXml(selectedElement.imageSrc)}</image_src>`
      : undefined,
    selectedElement.imageAlt
      ? `<image_alt>${escapeXml(selectedElement.imageAlt)}</image_alt>`
      : undefined,
    selectedElement.imageWidth || selectedElement.imageHeight
      ? `<image_size>${selectedElement.imageWidth || ""}x${selectedElement.imageHeight || ""}</image_size>`
      : undefined,
    selectedElement.imageDataUrl
      ? `<image_attachment>Selected image pixels are available as an image attachment in available_attachments.</image_attachment>`
      : undefined,
    selectedElement.outerHTML
      ? `<outer_html>${escapeXml(selectedElement.outerHTML.slice(0, SELECTED_ELEMENT_HTML_MAX_CHARS))}</outer_html>`
      : undefined,
    "</selected_element>",
  ]
    .filter(Boolean)
    .join("\n");
}

async function renderAttachedTab(tab: AttachmentTab, mode: ChatMode) {
  try {
    const text = isAskMode(mode) ? await extractTabText(tab.id) : "";
    return renderTabBlock(tab, text);
  } catch {
    return renderTabBlock(tab, "");
  }
}

function renderTabBlock(tab: AttachmentTab, text: string) {
  return [
    "<tab>",
    `<tab_id>${tab.id}</tab_id>`,
    "</tab>",
    `<title>${escapeXml(tab.title || "")}</title>`,
    `<url>${escapeXml(tab.url || "")}</url>`,
    `<content>${escapeXml(text ? text.slice(0, TAB_CONTENT_MAX_CHARS) : "")}</content>`,
  ].join("\n");
}
