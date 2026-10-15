import { useEffect, useState } from "react";

// Opens the side panel in this page's window. The browser opens it only in
// answer to a click, so the window is looked up before the click, not in
// it. undefined where the side panel can't be opened from here.
export function useOpenSidePanel() {
  const [windowId, setWindowId] = useState<number>();
  useEffect(() => {
    chrome.windows
      ?.getCurrent()
      .then((window) => setWindowId(window.id))
      .catch(console.warn);
  }, []);
  if (windowId === undefined || !chrome.sidePanel?.open) return undefined;
  return () => {
    chrome.sidePanel.open({ windowId }).catch(console.warn);
  };
}
