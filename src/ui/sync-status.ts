import type { Messages } from "../shared/i18n";
import type { SyncStatus } from "../shared/sync/state";

export type SyncTone =
  "off" | "idle" | "synced" | "syncing" | "pending" | "paused" | "error";

// One reading of the sync status for every place that shows it (the side
// panel's cloud button, the Sync settings page).
export function describeSyncStatus(
  t: Messages,
  status: SyncStatus | undefined,
  enabled: boolean,
  now = Date.now(),
): { tone: SyncTone; label: string } {
  if (!enabled) return { tone: "off", label: t.sync.stateOff };
  if (status?.massDelete?.length || status?.warnings.length)
    return { tone: "error", label: t.sync.stateAttention };
  if (status?.pausedUntil && status.pausedUntil > now)
    return {
      tone: "paused",
      label: t.sync.statePaused.replace(
        "{time}",
        formatTime(status.pausedUntil),
      ),
    };
  if (status?.error) return { tone: "error", label: t.sync.stateError };
  if (status?.running) return { tone: "syncing", label: t.sync.stateSyncing };
  if (status?.pendingCount)
    return {
      tone: "pending",
      label: t.sync.statePending.replace(
        "{count}",
        String(status.pendingCount),
      ),
    };
  if (status?.lastSyncAt) return { tone: "synced", label: t.sync.stateSynced };
  return { tone: "idle", label: t.sync.stateNeverSynced };
}

export function formatTime(value: number) {
  const date = new Date(value);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString() : date.toLocaleString();
}
