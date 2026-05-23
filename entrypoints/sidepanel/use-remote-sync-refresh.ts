import { useEffect } from "react";
import {
  refreshSyncFromRemote,
  syncRemoteRefreshIntervalMs,
} from "../../src/shared/storage-remote-sync";
import type { Preferences } from "../../src/shared/types";

export function useRemoteSyncRefresh(preferences: Preferences | undefined) {
  useEffect(() => {
    if (!preferences) return;
    let disposed = false;
    let running = false;

    const refresh = async () => {
      if (disposed || running) return;
      running = true;
      try {
        await refreshSyncFromRemote(preferences);
      } catch (error) {
        console.warn("Failed to refresh sync data", error);
      } finally {
        running = false;
      }
    };

    refresh();
    const intervalId = setInterval(refresh, syncRemoteRefreshIntervalMs());
    return () => {
      disposed = true;
      clearInterval(intervalId);
    };
  }, [preferences]);
}
