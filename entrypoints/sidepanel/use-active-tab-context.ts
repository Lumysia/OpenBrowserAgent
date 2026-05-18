import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { getActiveTab, isScriptableUrl } from "../../src/shared/browser";
import type { AttachmentTab, SelectedElement } from "../../src/shared/types";
import { toAttachmentTab } from "./sidepanel-context";

export function useActiveTabContext({
  attachedTabs,
  selectedElement,
  setAttachedTabs,
  setSelectedElement,
  autoAttachSuppressedRef,
}: {
  attachedTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>;
  setSelectedElement: Dispatch<SetStateAction<SelectedElement | null>>;
  autoAttachSuppressedRef: MutableRefObject<boolean>;
}) {
  const autoAttachedRef = useRef(false);
  const autoAttachedTabIdRef = useRef<number | null>(null);

  useEffect(() => {
    setAttachedTabs((tabs) => {
      const filtered = tabs.filter((tab) => isScriptableUrl(tab.url));
      if (!filtered.some((tab) => tab.id === autoAttachedTabIdRef.current))
        autoAttachedTabIdRef.current = null;
      return filtered;
    });
  }, [setAttachedTabs]);

  useEffect(() => {
    const listener = (message: SelectedElement & { type?: string }) => {
      if (message.type === "getSelectedElement" || message.success)
        setSelectedElement(message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setSelectedElement]);

  useEffect(() => {
    if (
      autoAttachedRef.current ||
      autoAttachSuppressedRef.current ||
      selectedElement ||
      attachedTabs.length
    )
      return;
    autoAttachedRef.current = true;
    void autoAttachActiveTab(setAttachedTabs, autoAttachedTabIdRef);
  }, [attachedTabs.length, selectedElement, setAttachedTabs]);

  useEffect(() => {
    if (
      autoAttachedTabIdRef.current !== null &&
      !attachedTabs.some((tab) => tab.id === autoAttachedTabIdRef.current)
    )
      autoAttachedTabIdRef.current = null;
  }, [attachedTabs]);

  useEffect(() => {
    const syncActiveTab = () => {
      void syncActiveTabContext({
        attachedTabs,
        selectedElement,
        setAttachedTabs,
        autoAttachedTabIdRef,
        autoAttachSuppressedRef,
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
  autoAttachedTabIdRef: MutableRefObject<number | null>,
) {
  const tab = await getActiveTab();
  const attachment = tab ? toAttachmentTab(tab) : null;
  if (attachment) {
    autoAttachedTabIdRef.current = attachment.id;
    setAttachedTabs([attachment]);
  }
}

async function syncActiveTabContext({
  attachedTabs,
  selectedElement,
  setAttachedTabs,
  autoAttachedTabIdRef,
  autoAttachSuppressedRef,
}: {
  attachedTabs: AttachmentTab[];
  selectedElement: SelectedElement | null;
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>;
  autoAttachedTabIdRef: MutableRefObject<number | null>;
  autoAttachSuppressedRef: MutableRefObject<boolean>;
}) {
  const tab = await getActiveTab();
  const attachment = tab ? toAttachmentTab(tab) : null;
  if (!attachment) {
    const autoAttachedTabId = autoAttachedTabIdRef.current;
    if (autoAttachedTabId !== null) {
      setAttachedTabs((tabs) =>
        tabs.filter((item) => item.id !== autoAttachedTabId),
      );
      autoAttachedTabIdRef.current = null;
    }
    return;
  }
  if (
    autoAttachSuppressedRef.current ||
    selectedElement ||
    attachedTabs.length >= 2 ||
    attachedTabs[0]?.id === attachment.id
  )
    return;
  autoAttachedTabIdRef.current = attachment.id;
  setAttachedTabs([attachment]);
}
