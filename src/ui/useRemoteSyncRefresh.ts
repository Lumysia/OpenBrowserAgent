import { useEffect } from "react";
import { SYNC_REMOTE_REFRESH_INPUT_IDLE_MS } from "../shared/config";
import {
  refreshSyncDataFromRemote,
  refreshSyncSettingsFromRemote,
  syncRemoteRefreshIntervalMs,
  syncSettingsRefreshIntervalMs,
} from "../shared/storage-remote-sync";
import type { SyncDataSettings } from "../shared/sync-data-settings";

let sharedSettingsRefresh: Promise<SyncDataSettings | undefined> | undefined;
let sharedDataRefresh: Promise<void> | undefined;
let inputListeners = 0;
let lastScrollInputAt = 0;

export function useRemoteSyncRefresh(
  syncDataSettings: SyncDataSettings | undefined,
) {
  useEffect(() => {
    if (!syncDataSettings) return;
    let disposed = false;
    let settingsRunning = false;
    let dataRunning = false;
    let deferredSettingsRefresh: ReturnType<typeof setTimeout> | undefined;
    let deferredFullRefresh: ReturnType<typeof setTimeout> | undefined;
    const unwatchInput = watchScrollInput();

    const refreshSettings = async () => {
      if (disposed || settingsRunning) return syncDataSettings;
      settingsRunning = true;
      try {
        return (
          (await runSharedSettingsRefresh(syncDataSettings)) || syncDataSettings
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
        await runSharedDataRefresh(settings);
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

    const scheduleRefreshSettings = () => {
      if (disposed) return;
      const waitMs = inputIdleWaitMs();
      if (waitMs <= 0) {
        refreshSettings().catch(noop);
        return;
      }
      if (deferredSettingsRefresh) clearTimeout(deferredSettingsRefresh);
      deferredSettingsRefresh = setTimeout(() => {
        deferredSettingsRefresh = undefined;
        refreshSettings().catch(noop);
      }, waitMs);
    };

    const scheduleRefreshAll = () => {
      if (disposed) return;
      const waitMs = inputIdleWaitMs();
      if (waitMs <= 0) {
        refreshAll().catch(noop);
        return;
      }
      if (deferredFullRefresh) clearTimeout(deferredFullRefresh);
      deferredFullRefresh = setTimeout(() => {
        deferredFullRefresh = undefined;
        refreshAll().catch(noop);
      }, waitMs);
    };

    const refreshVisible = () => {
      if (document.visibilityState === "visible") scheduleRefreshAll();
    };

    scheduleRefreshAll();
    const settingsIntervalId = setInterval(
      () => scheduleRefreshSettings(),
      syncSettingsRefreshIntervalMs(),
    );
    const dataIntervalId = setInterval(
      () => scheduleRefreshAll(),
      syncRemoteRefreshIntervalMs(),
    );
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      disposed = true;
      if (deferredSettingsRefresh) clearTimeout(deferredSettingsRefresh);
      if (deferredFullRefresh) clearTimeout(deferredFullRefresh);
      clearInterval(settingsIntervalId);
      clearInterval(dataIntervalId);
      unwatchInput();
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [syncDataSettings]);
}

function noop() {}

function runSharedSettingsRefresh(syncDataSettings: SyncDataSettings) {
  sharedSettingsRefresh ??= refreshSyncSettingsFromRemote(
    syncDataSettings,
  ).finally(() => {
    sharedSettingsRefresh = undefined;
  });
  return sharedSettingsRefresh;
}

function runSharedDataRefresh(syncDataSettings: SyncDataSettings) {
  sharedDataRefresh ??= refreshSyncDataFromRemote(syncDataSettings).finally(
    () => {
      sharedDataRefresh = undefined;
    },
  );
  return sharedDataRefresh;
}

function watchScrollInput() {
  inputListeners += 1;
  if (inputListeners === 1) {
    window.addEventListener("wheel", markScrollInput, { passive: true });
    window.addEventListener("touchmove", markScrollInput, { passive: true });
    window.addEventListener("scroll", markScrollInput, {
      capture: true,
      passive: true,
    });
  }
  return () => {
    inputListeners -= 1;
    if (inputListeners > 0) return;
    window.removeEventListener("wheel", markScrollInput);
    window.removeEventListener("touchmove", markScrollInput);
    window.removeEventListener("scroll", markScrollInput, { capture: true });
  };
}

function markScrollInput() {
  lastScrollInputAt = performance.now();
}

function inputIdleWaitMs() {
  const elapsed = performance.now() - lastScrollInputAt;
  return Math.max(0, SYNC_REMOTE_REFRESH_INPUT_IDLE_MS - elapsed);
}
