import { useEffect, useState } from "react";
import { getBrowserApi } from "../shared/browser-api";

// The window this page is in, looked up ahead: browsers open the side panel
// only during the user's click, before any await.
export function useCurrentWindowId() {
  const [windowId, setWindowId] = useState<number>();
  useEffect(() => {
    getBrowserApi()
      .windows?.getCurrent()
      .then((window) => setWindowId(window.id))
      .catch(console.warn);
  }, []);
  return windowId;
}
