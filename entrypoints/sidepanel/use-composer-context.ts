import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveTab,
  getAllTabs,
  isScriptableUrl,
} from "../../src/shared/browser";
import type {
  AttachmentTab,
  SelectedElement,
  SelectedText,
} from "../../src/shared/types";
import { addSelectedText } from "./selected-text";
import { toAttachmentTab } from "./sidepanel-context";
import { useActiveTabContext } from "./use-active-tab-context";

export function useComposerContext() {
  const [attachedTabs, setAttachedTabs] = useState<AttachmentTab[]>([]);
  const [availableTabs, setAvailableTabs] = useState<AttachmentTab[]>([]);
  const [activeTabAttachable, setActiveTabAttachable] = useState(false);
  const autoAttachSuppressedRef = useRef(false);
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>(
    [],
  );
  const [selectedTexts, setSelectedTexts] = useState<SelectedText[]>([]);

  useActiveTabContext({
    attachedTabs,
    // Selected elements and texts belong to their page.
    pinned: selectedElements.length + selectedTexts.length > 0,
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
    const tab = await getActiveTab();
    const attachment = tab ? toAttachmentTab(tab) : null;
    if (attachment) attachTab(attachment);
  }

  const attachTab = useCallback((attachment: AttachmentTab) => {
    autoAttachSuppressedRef.current = false;
    setAttachedTabs((tabs) => [
      ...tabs.filter((item) => item.id !== attachment.id),
      attachment,
    ]);
  }, []);

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

  const attachSelectedText = useCallback((selection: SelectedText) => {
    setSelectedTexts((items) => addSelectedText(items, selection));
  }, []);

  function removeSelectedText(selection: SelectedText) {
    setSelectedTexts((items) => items.filter((item) => item !== selection));
  }

  function clearComposerContextAfterSend() {
    autoAttachSuppressedRef.current = true;
    setAttachedTabs([]);
    setSelectedElements([]);
    setSelectedTexts([]);
  }

  function clearComposerContext() {
    autoAttachSuppressedRef.current = false;
    setAttachedTabs([]);
    setSelectedElements([]);
    setSelectedTexts([]);
  }

  return {
    attachedTabs,
    availableTabs,
    activeTabAttachable,
    selectedElements,
    selectedTexts,
    setAttachedTabs,
    clearComposerContext,
    clearComposerContextAfterSend,
    setAvailableTabs,
    setSelectedElements,
    setSelectedTexts,
    attachSelectedText,
    removeSelectedText,
    attachActiveTab,
    attachTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  };
}
