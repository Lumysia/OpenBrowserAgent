import { useEffect } from "react";
import { reportPageState } from "../shared/sync/client";

// Tells the background sync scheduler whether this page is visible, so it
// checks for changes when a page opens or gets focus and every minute while
// one is visible. Pages run no sync timers of their own.
export function useSyncPageState() {
  useEffect(() => {
    const report = () =>
      void reportPageState(
        document.visibilityState === "visible",
        document.hasFocus(),
      ).catch(() => undefined);
    const hidden = () =>
      void reportPageState(false, false).catch(() => undefined);
    report();
    window.addEventListener("focus", report);
    window.addEventListener("online", report);
    document.addEventListener("visibilitychange", report);
    window.addEventListener("pagehide", hidden);
    return () => {
      window.removeEventListener("focus", report);
      window.removeEventListener("online", report);
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("pagehide", hidden);
    };
  }, []);
}
