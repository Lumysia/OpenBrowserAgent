import { useEffect, useState } from "react";
import {
  getActiveTab,
  injectElementSelector,
  isScriptableUrl,
} from "../../src/shared/browser";
import type { Messages } from "../../src/shared/i18n";
import { getBrowserApi } from "../../src/shared/storage";

const ELEMENT_SELECTOR_MESSAGE = {
  selected: "getSelectedElement",
  cancelled: "elementSelectorCancelled",
  cancel: "cancelElementSelector",
} as const;

export function useElementSelector(t: Messages) {
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
    if (!tab?.id || !isScriptableUrl(tab.url)) return;
    setSelectingElement(true);
    const injected = await injectElementSelector(
      tab.id,
      `${t.sidepanel.selectElement} - Esc ${t.common.cancel}`,
    ).catch(() => false);
    if (!injected) setSelectingElement(false);
  }

  async function cancelElementSelection() {
    setSelectingElement(false);
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await getBrowserApi()
      .tabs.sendMessage(tab.id, { type: ELEMENT_SELECTOR_MESSAGE.cancel })
      .catch(() => undefined);
  }

  return { selectingElement, selectElement };
}
