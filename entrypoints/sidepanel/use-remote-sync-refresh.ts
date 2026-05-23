import { useEffect } from "react";
import {
  refreshSyncFromRemote,
  syncRemoteRefreshIntervalMs,
} from "../../src/shared/storage-remote-sync";
import type { SyncDataSettings } from "../../src/shared/sync-data-settings";

export function useRemoteSyncRefresh(
  syncDataSettings: SyncDataSettings | undefined,
) {
  useEffect(() => {
    if (!syncDataSettings) return;
    let disposed = false;
    let running = false;

    const refresh = async () => {
      if (disposed || running) return;
      running = true;
      try {
        await refreshSyncFromRemote(syncDataSettings);
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
  }, [syncDataSettings]);
}
