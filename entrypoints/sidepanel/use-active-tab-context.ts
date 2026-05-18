import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { getActiveTab } from "../../src/shared/browser";
import type { AttachmentTab, SelectedElement } from "../../src/shared/types";
import { toAttachmentTab } from "./sidepanel-context";

export function useActiveTabContext({
  attachedTabs,
  selectedElement,
  setAttachedTabs,
  setSelectedElement,
}: {
  attachedTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>;
  setSelectedElement: Dispatch<SetStateAction<SelectedElement | null>>;
}) {
  const autoAttachedRef = useRef(false);

  useEffect(() => {
    const listener = (message: SelectedElement & { type?: string }) => {
      if (message.type === "getSelectedElement" || message.success)
        setSelectedElement(message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setSelectedElement]);

  useEffect(() => {
    if (autoAttachedRef.current || selectedElement || attachedTabs.length)
      return;
    autoAttachedRef.current = true;
    void autoAttachActiveTab(setAttachedTabs);
  }, [attachedTabs.length, selectedElement, setAttachedTabs]);

  useEffect(() => {
    const syncActiveTab = () => {
      void syncActiveTabContext({
        attachedTabs,
        selectedElement,
        setAttachedTabs,
      });
    };
    chrome.tabs.onActivated.addListener(syncActiveTab);
    chrome.tabs.onUpdated.addListener(syncActiveTab);
    return () => {
      chrome.tabs.onActivated.removeListener(syncActiveTab);
      chrome.tabs.onUpdated.removeListener(syncActiveTab);
    };
  }, [attachedTabs, selectedElement, setAttachedTabs]);
}

async function autoAttachActiveTab(
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>,
) {
  const tab = await getActiveTab();
  const attachment = tab ? toAttachmentTab(tab) : null;
  if (attachment) setAttachedTabs([attachment]);
}

async function syncActiveTabContext({
  attachedTabs,
  selectedElement,
  setAttachedTabs,
}: {
  attachedTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>;
}) {
  const tab = await getActiveTab();
  const attachment = tab ? toAttachmentTab(tab) : null;
  if (
    !attachment ||
    selectedElement ||
    attachedTabs.length >= 2 ||
    attachedTabs[0]?.id === attachment.id
  )
    return;
  setAttachedTabs([attachment]);
}
