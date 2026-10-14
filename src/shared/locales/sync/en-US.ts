import { plural } from "../../plural";
export const syncEnUS = {
  statusTitle: "Sync status",
  stateOff: "Sync is off",
  stateNeverSynced: "Not synced yet",
  stateSynced: "Up to date",
  stateSyncing: "Syncing…",
  statePending: plural({
    one: "{count} change waiting to sync",
    other: "{count} changes waiting to sync",
  }),
  statePaused: "Paused until {time}",
  stateError: "Last sync failed",
  stateAttention: "Sync needs your attention",
  lastSync: "Last sync: {time}",
  pausedRateLimit:
    "The server asked to slow down (HTTP {status}). Sync resumes on its own.",
  syncNow: "Sync now",
  webDavOnly: "WebDAV only: browser account sync storage is too small.",
  warnings: {
    "unreliable-etags":
      "This server can't be written to safely. Use a WebDAV server that sends strong ETags.",
    "ignores-preconditions":
      "This server doesn't support version checks; sync works around it.",
    "newer-format":
      "Another device uses a newer sync format. Update OpenBrowserAgent to keep syncing.",
    "missing-content": "Some synced content is missing on the server.",
    quota:
      "Browser account sync storage is full. Turn off some sync items or use WebDAV.",
    "cloned-device":
      "This browser now syncs as a new device. Changes on both are kept.",
  },
  warningDetails: {
    "unreliable-etags":
      "Its file versions are unreliable, so this device doesn't upload changes. It still downloads changes from other devices.",
    "ignores-preconditions":
      "When two devices save at the same moment, one upload can overwrite the other. Each device keeps its changes and merges them again on its next sync. If both changed the same value, the newer change is kept.",
    "missing-content":
      "This device keeps its copy until another device uploads it again.",
    "cloned-device":
      "Another browser was syncing as this device, for example a copied browser profile or a backup restored on another computer.",
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
