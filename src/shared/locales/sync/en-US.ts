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
  groupSettings: "Settings",
  groupSettingsDescription:
    "Always synced: language, preferences, AI providers and MCP servers without their keys, agents with their MEMORY.md and USER.md, and skills without their files.",
  groupAlways: "Always",
  groupKeys: "Keys",
  groupKeysDescription:
    "API keys and MCP request headers, encrypted with your sync passphrase before they leave this device.",
  groupChats: "Chats",
  groupChatsDescription:
    "Chat history, without attachments. Keep this off for local-only conversations.",
  groupFiles: "Files",
  groupFilesDescription:
    "Skill files, agent workspace files other than MEMORY.md and USER.md, and chat attachments (with chats on).",
  passphrase: "Sync passphrase",
  passphraseRepeat: "Repeat the passphrase",
  passphraseCreate:
    "Set a sync passphrase. Every device that syncs keys asks for it once. It can’t be recovered: if you forget it, set a new one and your keys stay on each device.",
  passphraseEnter:
    "Keys are encrypted with a sync passphrase set on another device. Enter it once to sync keys here.",
  passphraseChangeDescription:
    "Set a new sync passphrase. Your other devices ask for it once.",
  passphraseTooShort: "Use at least {min} characters.",
  passphraseMismatch: "The passphrases don’t match.",
  passphraseWrong: "Wrong passphrase. Enter the one set on your other device.",
  passphraseSave: "Save passphrase",
  passphraseChange: "Change passphrase",
  keysLocked: "Enter the sync passphrase to sync keys on this device.",
  keysUnlocked: "Keys sync encrypted with your sync passphrase.",
  filesNotSynced:
    "Files aren’t synced on this device. Your other devices keep them as they are.",
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
    "recovered-root":
      "The sync file on the server was damaged. It was rebuilt from its previous copy and this device’s data.",
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
    "recovered-root":
      "This happens when an upload stops halfway. Nothing on your devices was lost: each one uploads its changes again.",
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
  choiceTitle: "Sync this device",
  choiceOff: "Off",
  choiceBrowser: "Browser account",
  choiceWebDav: "WebDAV",
  choiceOffHint: "Everything stays on this device.",
  whatSyncs: "What syncs",
  copyCode: "Copy sync code for another device",
  codeCopied: "Sync code copied",
  pasteCode: "Paste a sync code from another device",
};
export type SyncMessages = typeof syncEnUS;
