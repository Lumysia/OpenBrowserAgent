export const syncEnUS = {
  statusTitle: "Sync status",
  stateOff: "Sync is off",
  stateNeverSynced: "Not synced yet",
  stateSynced: "Up to date",
  stateSyncing: "Syncing…",
  statePending: "{count} change(s) waiting to sync",
  statePaused: "Paused until {time}",
  stateError: "Last sync failed",
  stateAttention: "Sync needs your attention",
  lastSync: "Last sync: {time}",
  pausedRateLimit:
    "The server asked to slow down (HTTP {status}). Sync resumes on its own.",
  syncNow: "Sync now",
  webDavOnly:
    "Chats and attachments sync through WebDAV only. Browser account sync storage is too small for them.",
  warnings: {
    "unreliable-etags":
      "This server's file versions are unreliable, so changes from this device are not uploaded. Use a WebDAV server that sends strong ETags.",
    "ignores-preconditions":
      "This server doesn't support version checks, so sync uses a slower safe mode: if two devices save at the same moment, one change arrives a sync later. Nothing is lost.",
    "newer-format":
      "Another device uses a newer sync format. Update OpenBrowserAgent on this device to keep syncing.",
    "missing-content":
      "Some synced content is missing on the server. This device keeps its copy until another device uploads it again.",
    quota:
      "Browser account sync storage is full. Turn off some sync items or use WebDAV.",
  },
  massDeleteTitle: "Confirm deletions from another device",
  massDeleteDescription:
    "The latest sync would delete {count} of {total} items in {collection} on this device.",
  massDeleteApply: "Delete on this device",
  massDeleteKeep: "Keep and upload again",
  massDeleteLocalTitle: "Confirm deletions on this device",
  massDeleteLocalDescription:
    "{count} of {total} items in {collection} are gone from this device. Syncing would delete them on every device.",
  massDeleteLocalApply: "Delete on every device",
  massDeleteLocalKeep: "Restore on this device",
};
export type SyncMessages = typeof syncEnUS;
