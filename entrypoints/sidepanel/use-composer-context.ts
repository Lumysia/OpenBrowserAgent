import { useState } from "react";
import { getActiveTab } from "../../src/shared/browser";
import type {
  AttachmentTab,
  Chat,
  SelectedElement,
} from "../../src/shared/types";
import { toAttachmentTab } from "./sidepanel-context";
import { useActiveTabContext } from "./use-active-tab-context";

export function useComposerContext(chats: Chat[]) {
  const [attachedTabs, setAttachedTabs] = useState<AttachmentTab[]>([]);
  const [availableTabs, setAvailableTabs] = useState<AttachmentTab[]>([]);
  const [selectedElement, setSelectedElement] =
    useState<SelectedElement | null>(null);

  useActiveTabContext({
    attachedTabs,
    selectedElement,
    setAttachedTabs,
    setSelectedElement,
  });

  async function attachActiveTab() {
    const tab = await getActiveTab();
    const attachment = tab ? toAttachmentTab(tab) : null;
    if (!attachment) return;
    setAttachedTabs((tabs) => [
      ...tabs.filter((item) => item.id !== attachment.id),
      attachment,
    ]);
  }

  async function showAllTabsPicker() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    setAvailableTabs(
      tabs
        .map((tab) => toAttachmentTab(tab))
        .filter((tab): tab is AttachmentTab => !!tab),
    );
  }

  function toggleAttachedTab(tab: AttachmentTab) {
    setAttachedTabs((tabs) =>
      tabs.some((item) => item.id === tab.id)
        ? tabs.filter((item) => item.id !== tab.id)
        : [...tabs, tab],
    );
  }

  function removeAttachedTab(tabId: number) {
    setAttachedTabs((tabs) => tabs.filter((item) => item.id !== tabId));
  }

  return {
    attachedTabs,
    availableTabs,
    selectedElement,
    setAttachedTabs,
    setAvailableTabs,
    setSelectedElement,
    attachActiveTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  };
}
