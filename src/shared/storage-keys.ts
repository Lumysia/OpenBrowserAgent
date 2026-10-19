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
  // storage.session (see session-record.ts): extension pages and whether
  // they are visible; the tabs and tab groups the agent opened per chat;
  // the downloads each chat started; the last tab of each chat's runs; the
  // page agent's element ref counter; the tabs that show a translation;
  // where the guided setup stands.
  syncVisiblePages: "sync-visible-pages",
  agentTabs: "agent-tabs",
  agentDownloads: "agent-downloads",
  runTabs: "run-tabs",
  pageRefFloor: "page-ref-floor",
  pageTranslateTabs: "page-translate-tabs",
  setupProgress: "setup-progress",
  syncBackends: "sync-backends",
  activeSyncBackendId: "active-sync-backend-id",
  syncDeviceId: "sync-device-id",
  syncGroups: "sync-groups",
  // Per backend scope: `sync-keyring:<scope>`, the key derived from the sync
  // passphrase (see sync/keys.ts).
  syncKeyring: "sync-keyring",
  // The sync format local sync data was last cleaned up for.
  syncFormat: "sync-format",
  // The local day a holiday burst last played (see holidays.ts).
  holidayBurstDay: "holiday-burst-day",
  // Where the page translation button was dragged to (this device only).
  pageTranslateButtonPosition: "page-translate-button-position",
  ignoreSyncedProvidersForBootstrap: "ignore-synced-providers-for-bootstrap",
  // What models refused, learned on this device (see model-limits.ts).
  learnedModelLimits: "learned-model-limits",
  // Whether the guided setup reached its last step on this device (see
  // setup-gate.ts).
  setupDone: "setup-done",
  // The storage migrations this device has run (see storage-migrations.ts).
  storageMigrations: "storage-migrations",
  // A selection handed from a page to the side panel (session storage where
  // there is one); the name is the one the smart bar's handoff always used.
  sidePanelHandoff: "smart-bar-handoff",
  // Scheduled tasks and page watches (synced definitions), the devices that
  // can run them (synced), this device's id among them, and what each task
  // learned on this device (see tasks/types.ts).
  tasks: "tasks",
  taskDevices: "task-devices",
  taskDeviceId: "task-device-id",
  taskStates: "task-states",
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
