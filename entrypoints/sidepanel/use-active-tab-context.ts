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
  pinned,
  setAttachedTabs,
  setSelectedElements,
  autoAttachSuppressedRef,
}: {
  attachedTabs: AttachmentTab[];
  // The attached tab stays when another tab becomes active.
  pinned: boolean;
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>;
  setSelectedElements: Dispatch<SetStateAction<SelectedElement[]>>;
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
        setSelectedElements((items) => upsertSelectedElement(items, message));
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [setSelectedElements]);

  useEffect(() => {
    if (
      autoAttachedRef.current ||
      autoAttachSuppressedRef.current ||
      pinned ||
      attachedTabs.length
    )
      return;
    autoAttachedRef.current = true;
    void autoAttachActiveTab(setAttachedTabs, autoAttachedTabIdRef);
  }, [attachedTabs.length, pinned, setAttachedTabs]);

  useEffect(() => {
    if (
      autoAttachedTabIdRef.current !== null &&
      !attachedTabs.some((tab) => tab.id === autoAttachedTabIdRef.current)
    )
      autoAttachedTabIdRef.current = null;
  }, [attachedTabs]);

  useEffect(() => {
    const syncActiveTab = (tab?: chrome.tabs.Tab) => {
      void syncActiveTabContext({
        tab,
        attachedTabs,
        pinned,
        setAttachedTabs,
        autoAttachedTabIdRef,
        autoAttachSuppressedRef,
      });
    };
    const handleActivated = (_activeInfo: { tabId: number }) => {
      syncActiveTab();
    };
    const handleUpdated = (
      _tabId: number,
      info: { url?: string; title?: string; favIconUrl?: string },
      tab: chrome.tabs.Tab,
    ) => {
      if (!info.url && !info.title && !info.favIconUrl) return;
      if (tab.active) syncActiveTab();
    };
    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, [attachedTabs, pinned, setAttachedTabs]);
}

function upsertSelectedElement(
  elements: SelectedElement[],
  element: SelectedElement,
) {
  const key = element.ref || `${element.tagName}:${element.outerHTML}`;
  return [
    ...elements.filter(
      (item) => (item.ref || `${item.tagName}:${item.outerHTML}`) !== key,
    ),
    element,
  ];
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
  tab,
  attachedTabs,
  pinned,
  setAttachedTabs,
  autoAttachedTabIdRef,
  autoAttachSuppressedRef,
}: {
  tab?: chrome.tabs.Tab;
  attachedTabs: AttachmentTab[];
  pinned: boolean;
  setAttachedTabs: Dispatch<SetStateAction<AttachmentTab[]>>;
  autoAttachedTabIdRef: MutableRefObject<number | null>;
  autoAttachSuppressedRef: MutableRefObject<boolean>;
}) {
  tab ??= await getActiveTab();
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
  if (autoAttachSuppressedRef.current || pinned || attachedTabs.length >= 2)
    return;
  if (attachedTabs[0]?.id === attachment.id) {
    setAttachedTabs((tabs) =>
      tabs.map((item) => (item.id === attachment.id ? attachment : item)),
    );
    autoAttachedTabIdRef.current = attachment.id;
    return;
  }
  autoAttachedTabIdRef.current = attachment.id;
  setAttachedTabs([attachment]);
}
