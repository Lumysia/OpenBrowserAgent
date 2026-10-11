import { useEffect } from "react";
import {
  SYNC_REMOTE_REFRESH_INTERVAL_MS,
  SYNC_SETTINGS_REFRESH_INTERVAL_MS,
} from "../shared/config";
import type { SyncDataSettings } from "../shared/storage-keys";
import {
  refreshSyncDataFromRemote,
  refreshSyncSettingsFromRemote,
} from "../shared/storage-sync";

// Pages share one refresh at a time. A refresh that finds nothing new does not
// write storage, so nothing re-renders.
let running: Promise<void> | undefined;

function refresh(includeData: boolean) {
  running ??= (async () => {
    await refreshSyncSettingsFromRemote();
    if (includeData) await refreshSyncDataFromRemote();
  })()
    .catch((error) => console.warn("Failed to refresh sync data", error))
    .finally(() => {
      running = undefined;
    });
  return running;
}

export function useRemoteSyncRefresh(
  syncDataSettings: SyncDataSettings | undefined,
) {
  useEffect(() => {
    if (!syncDataSettings) return;
    const refreshAll = () => void refresh(true);
    const refreshVisible = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    refreshAll();
    const settingsTimer = setInterval(
      () => void refresh(false),
      SYNC_SETTINGS_REFRESH_INTERVAL_MS,
    );
    const dataTimer = setInterval(refreshAll, SYNC_REMOTE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearInterval(settingsTimer);
      clearInterval(dataTimer);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [syncDataSettings]);
}
