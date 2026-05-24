import { useEffect, useRef, useState } from "react";
import {
  getActiveTab,
  getAllTabs,
  isScriptableUrl,
} from "../../src/shared/browser";
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
  const [activeTabAttachable, setActiveTabAttachable] = useState(false);
  const autoAttachSuppressedRef = useRef(false);
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>(
    [],
  );

  useActiveTabContext({
    attachedTabs,
    selectedElements,
    setAttachedTabs,
    setSelectedElements,
    autoAttachSuppressedRef,
  });

  useEffect(() => {
    const updateActiveTabAttachable = (tab?: chrome.tabs.Tab) => {
      if (tab) {
        setActiveTabAttachable(isScriptableUrl(tab.url));
        return;
      }
      void getActiveTab().then((activeTab) =>
        setActiveTabAttachable(isScriptableUrl(activeTab?.url)),
      );
    };
    updateActiveTabAttachable();
    const handleActivated = (_activeInfo: { tabId: number }) => {
      updateActiveTabAttachable();
    };
    const handleUpdated = (
      _tabId: number,
      info: { url?: string; title?: string; favIconUrl?: string },
      tab: chrome.tabs.Tab,
    ) => {
      if (!info.url && !info.title && !info.favIconUrl) return;
      if (tab.active) updateActiveTabAttachable();
    };
    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, []);

  async function attachActiveTab() {
    autoAttachSuppressedRef.current = false;
    const tab = await getActiveTab();
    const attachment = tab ? toAttachmentTab(tab) : null;
    if (!attachment) return;
    setAttachedTabs((tabs) => [
      ...tabs.filter((item) => item.id !== attachment.id),
      attachment,
    ]);
  }

  async function showAllTabsPicker() {
    setAvailableTabs(await getAllTabs());
  }

  function toggleAttachedTab(tab: AttachmentTab) {
    if (!isScriptableUrl(tab.url)) return;
    autoAttachSuppressedRef.current = false;
    setAttachedTabs((tabs) =>
      tabs.some((item) => item.id === tab.id)
        ? tabs.filter((item) => item.id !== tab.id)
        : [...tabs, tab],
    );
  }

  function removeAttachedTab(tabId: number) {
    setAttachedTabs((tabs) => tabs.filter((item) => item.id !== tabId));
  }

  function clearAttachedTabsAfterSend() {
    autoAttachSuppressedRef.current = true;
    setAttachedTabs([]);
  }

  function clearComposerContext() {
    autoAttachSuppressedRef.current = false;
    setAttachedTabs([]);
    setSelectedElements([]);
  }

  return {
    attachedTabs,
    availableTabs,
    activeTabAttachable,
    selectedElements,
    setAttachedTabs,
    clearComposerContext,
    clearAttachedTabsAfterSend,
    setAvailableTabs,
    setSelectedElements,
    attachActiveTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  };
}
