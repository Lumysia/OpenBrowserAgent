import { useEffect } from "react";
import {
  refreshSyncDataFromRemote,
  refreshSyncSettingsFromRemote,
  syncRemoteRefreshIntervalMs,
  syncSettingsRefreshIntervalMs,
} from "../shared/storage-remote-sync";
import type { SyncDataSettings } from "../shared/sync-data-settings";

export function useRemoteSyncRefresh(
  syncDataSettings: SyncDataSettings | undefined,
) {
  useEffect(() => {
    if (!syncDataSettings) return;
    let disposed = false;
    let settingsRunning = false;
    let dataRunning = false;

    const refreshSettings = async () => {
      if (disposed || settingsRunning) return syncDataSettings;
      settingsRunning = true;
      try {
        return (
          (await refreshSyncSettingsFromRemote(syncDataSettings)) ||
          syncDataSettings
        );
      } catch (error) {
        console.warn("Failed to refresh sync settings", error);
        return syncDataSettings;
      } finally {
        settingsRunning = false;
      }
    };

    const refreshData = async (settings: SyncDataSettings) => {
      if (disposed || dataRunning) return;
      dataRunning = true;
      try {
        await refreshSyncDataFromRemote(settings);
      } catch (error) {
        console.warn("Failed to refresh sync data", error);
      } finally {
        dataRunning = false;
      }
    };

    const refreshAll = async () => {
      const settings = await refreshSettings();
      await refreshData(settings);
    };

    const refreshVisible = () => {
      if (document.visibilityState === "visible") refreshAll().catch(noop);
    };

    refreshAll().catch(noop);
    const settingsIntervalId = setInterval(
      () => refreshSettings().catch(noop),
      syncSettingsRefreshIntervalMs(),
    );
    const dataIntervalId = setInterval(
      () => refreshAll().catch(noop),
      syncRemoteRefreshIntervalMs(),
    );
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true;
      clearInterval(settingsIntervalId);
      clearInterval(dataIntervalId);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [syncDataSettings]);
}

function noop() {}
