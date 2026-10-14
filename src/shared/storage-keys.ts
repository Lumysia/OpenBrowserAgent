export const STORAGE_KEYS = {
  language: "language",
  preferences: "preferences",
  provider: "provider",
  agents: "agents",
  agentWorkspaces: "agent-workspaces",
  skills: "skills",
  skillSettings: "skill-settings",
  mcpServers: "mcp-servers",
  localExecutionBridges: "local-execution-bridges",
  shouldShowUpdateToast: "should-show-update-toast",
  chats: "chats",
  chatTabs: "chat-tabs",
  chatAttachments: "chat-attachments",
  syncStatus: "sync-status",
  // One per backend scope: `sync-state:<scope>`.
  syncState: "sync-state",
  // One per synced collection: `sync-clocks:<collection>`.
  syncClocks: "sync-clocks",
  syncHlc: "sync-hlc",
  // Per collection that merges bodies: `sync-bases:<collection>` lists the
  // blobs whose bodies unconfirmed changes merge from, each body under
  // `sync-bases:<collection>:<blob>` (see sync/bases.ts).
  syncBases: "sync-bases",
  // Written by a round to wait for the edit listener (see sync/track.ts).
  syncEditMarker: "sync-edit-marker",
  // Browser sync parts no record refers to, by when this device saw them.
  syncPartsSeen: "sync-parts-seen",
  // storage.session: extension pages and whether they are visible.
  syncVisiblePages: "sync-visible-pages",
  syncBackends: "sync-backends",
  activeSyncBackendId: "active-sync-backend-id",
  syncDeviceId: "sync-device-id",
  syncGroups: "sync-groups",
  // Per backend scope: `sync-keyring:<scope>`, the key derived from the sync
  // passphrase (see sync/keys.ts).
  syncKeyring: "sync-keyring",
  // The sync format local sync data was last cleaned up for.
  syncFormat: "sync-format",
  debugLoggingEnabled: "debug-logging-enabled",
  // The local day a holiday burst last played (see holidays.ts).
  holidayBurstDay: "holiday-burst-day",
  ignoreSyncedProvidersForBootstrap: "ignore-synced-providers-for-bootstrap",
  // The storage migrations this device has run (see storage-migrations.ts).
  storageMigrations: "storage-migrations",
  // A selection handed from a page to the side panel (session storage where
  // there is one); the name is the one the smart bar's handoff always used.
  sidePanelHandoff: "smart-bar-handoff",
} as const;

// What syncs besides settings, one switch per group: API keys and MCP
// headers (encrypted with the sync passphrase), chats, and files (skill and
// workspace files, chat attachments). Settings always sync.
export const SYNC_GROUPS = {
  keys: "syncKeys",
  chats: "syncChats",
  files: "syncFiles",
} as const;

export type SyncGroup = (typeof SYNC_GROUPS)[keyof typeof SYNC_GROUPS];

export type SyncGroupSettings = Record<SyncGroup, boolean>;

export const DEFAULT_SYNC_GROUP_SETTINGS: SyncGroupSettings = {
  [SYNC_GROUPS.keys]: false,
  [SYNC_GROUPS.chats]: false,
  [SYNC_GROUPS.files]: true,
};

export function mergeSyncGroupSettings(
  value: Partial<SyncGroupSettings> | undefined,
): SyncGroupSettings {
  return { ...DEFAULT_SYNC_GROUP_SETTINGS, ...value };
}
