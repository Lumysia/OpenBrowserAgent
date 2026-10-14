import { formatDateTime } from "../shared/format";
import { formatCount, type Messages } from "../shared/i18n";
import { SYNC_NOTES, type SyncStatus } from "../shared/sync/state";

export type SyncTone =
  | "off"
  | "idle"
  | "synced"
  | "syncing"
  | "pending"
  | "paused"
  | "attention"
  | "error";

// One reading of the sync status for every place that shows it (the side
// panel's cloud button, the Sync settings page).
export function describeSyncStatus(
  t: Messages,
  status: SyncStatus | undefined,
  enabled: boolean,
  now = Date.now(),
): { tone: SyncTone; label: string } {
  if (!enabled) return { tone: "off", label: t.sync.stateOff };
  // Notes only say what sync handles on its own; they don't need the user.
  const needsUser = status?.warnings.some(
    (warning) => !SYNC_NOTES.includes(warning),
  );
  if (status?.massDelete?.length || needsUser)
    return { tone: "attention", label: t.sync.stateAttention };
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
      label: formatCount(t.sync.statePending, status.pendingCount),
    };
  if (status?.lastSyncAt) return { tone: "synced", label: t.sync.stateSynced };
  return { tone: "idle", label: t.sync.stateNeverSynced };
}

export function formatTime(value: number) {
  const today = new Date().toDateString() === new Date(value).toDateString();
  return formatDateTime(
    value,
    today
      ? { timeStyle: "medium" }
      : { dateStyle: "medium", timeStyle: "medium" },
  );
}
