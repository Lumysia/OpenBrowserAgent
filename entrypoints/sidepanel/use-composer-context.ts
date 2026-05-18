import { useEffect, useRef, useState } from "react";
import { getActiveTab, isScriptableUrl } from "../../src/shared/browser";
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
  const [selectedElement, setSelectedElement] =
    useState<SelectedElement | null>(null);

  useActiveTabContext({
    attachedTabs,
    selectedElement,
    setAttachedTabs,
    setSelectedElement,
    autoAttachSuppressedRef,
  });

  useEffect(() => {
    const updateActiveTabAttachable = () => {
      void getActiveTab().then((tab) =>
        setActiveTabAttachable(isScriptableUrl(tab?.url)),
      );
    };
    updateActiveTabAttachable();
    chrome.tabs.onActivated.addListener(updateActiveTabAttachable);
    chrome.tabs.onUpdated.addListener(updateActiveTabAttachable);
    return () => {
      chrome.tabs.onActivated.removeListener(updateActiveTabAttachable);
      chrome.tabs.onUpdated.removeListener(updateActiveTabAttachable);
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
    const tabs = await chrome.tabs.query({ currentWindow: true });
    setAvailableTabs(
      tabs
        .map((tab) => toAttachmentTab(tab))
        .filter((tab): tab is AttachmentTab => !!tab),
    );
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

  return {
    attachedTabs,
    availableTabs,
    activeTabAttachable,
    selectedElement,
    setAttachedTabs,
    clearAttachedTabsAfterSend,
    setAvailableTabs,
    setSelectedElement,
    attachActiveTab,
    showAllTabsPicker,
    toggleAttachedTab,
    removeAttachedTab,
  };
}
