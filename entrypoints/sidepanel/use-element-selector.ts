import { useEffect, useState } from "react";
import { getActiveTab, injectElementSelector } from "../../src/shared/browser";

const ELEMENT_SELECTOR_MESSAGE = {
  selected: "getSelectedElement",
  cancelled: "elementSelectorCancelled",
  cancel: "cancelElementSelector",
} as const;

export function useElementSelector() {
  const [selectingElement, setSelectingElement] = useState(false);

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (
        message.type === ELEMENT_SELECTOR_MESSAGE.selected ||
        message.type === ELEMENT_SELECTOR_MESSAGE.cancelled
      )
        setSelectingElement(false);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!selectingElement) return undefined;
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void cancelElementSelection();
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [selectingElement]);

  async function selectElement() {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    setSelectingElement(true);
    await injectElementSelector(tab.id);
  }

  async function cancelElementSelection() {
    setSelectingElement(false);
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await chrome.tabs
      .sendMessage(tab.id, { type: ELEMENT_SELECTOR_MESSAGE.cancel })
      .catch(() => undefined);
  }

  return { selectingElement, selectElement };
}
