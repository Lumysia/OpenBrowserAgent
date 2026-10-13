export const STORAGE_KEYS = {
  userId: "userId",
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
  // Browser sync parts no record refers to, by when this device saw them.
  syncPartsSeen: "sync-parts-seen",
  // storage.session: extension pages and whether they are visible.
  syncVisiblePages: "sync-visible-pages",
  syncBackends: "sync-backends",
  activeSyncBackendId: "active-sync-backend-id",
  syncDeviceId: "sync-device-id",
  syncDataSettings: "sync-data-settings",
  debugLoggingEnabled: "debug-logging-enabled",
  ignoreSyncedProvidersForBootstrap: "ignore-synced-providers-for-bootstrap",
} as const;

export const SYNC_PREFERENCES = {
  providers: "syncProviders",
  agents: "syncAgents",
  skills: "syncSkills",
  mcpServers: "syncMcpServers",
  localExecutionBridges: "syncLocalExecutionBridges",
  chats: "syncChats",
} as const;

export const SYNCABLE_DATA_ITEMS = [
  { preferenceKey: SYNC_PREFERENCES.providers, dataKey: STORAGE_KEYS.provider },
  { preferenceKey: SYNC_PREFERENCES.agents, dataKey: STORAGE_KEYS.agents },
  {
    preferenceKey: SYNC_PREFERENCES.agents,
    dataKey: STORAGE_KEYS.agentWorkspaces,
  },
  { preferenceKey: SYNC_PREFERENCES.skills, dataKey: STORAGE_KEYS.skills },
  {
    preferenceKey: SYNC_PREFERENCES.skills,
    dataKey: STORAGE_KEYS.skillSettings,
  },
  {
    preferenceKey: SYNC_PREFERENCES.mcpServers,
    dataKey: STORAGE_KEYS.mcpServers,
  },
  {
    preferenceKey: SYNC_PREFERENCES.localExecutionBridges,
    dataKey: STORAGE_KEYS.localExecutionBridges,
  },
  { preferenceKey: SYNC_PREFERENCES.chats, dataKey: STORAGE_KEYS.chats },
] as const;

export type SyncPreferenceKey =
  (typeof SYNCABLE_DATA_ITEMS)[number]["preferenceKey"];

export type SyncableDataKey = (typeof SYNCABLE_DATA_ITEMS)[number]["dataKey"];

export const SYNC_PREFERENCE_KEYS = Array.from(
  new Set(SYNCABLE_DATA_ITEMS.map((item) => item.preferenceKey)),
) as SyncPreferenceKey[];

export const SYNC_DATA_SETTING_KEYS = {
  chatAttachments: "syncChatAttachments",
} as const;

export type SyncDataSettings = Record<SyncPreferenceKey, boolean> & {
  [SYNC_DATA_SETTING_KEYS.chatAttachments]: boolean;
};

export const DEFAULT_SYNC_DATA_SETTINGS: SyncDataSettings = {
  [SYNC_PREFERENCES.providers]: true,
  [SYNC_PREFERENCES.agents]: false,
  [SYNC_PREFERENCES.skills]: false,
  [SYNC_PREFERENCES.mcpServers]: false,
  [SYNC_PREFERENCES.localExecutionBridges]: false,
  [SYNC_PREFERENCES.chats]: false,
  [SYNC_DATA_SETTING_KEYS.chatAttachments]: false,
};

export function mergeSyncDataSettings(
  value: Partial<SyncDataSettings> | undefined,
): SyncDataSettings {
  return { ...DEFAULT_SYNC_DATA_SETTINGS, ...value };
}

export const STORAGE_AREAS = {
  local: "local",
  sync: "sync",
} as const;

export type AreaName = (typeof STORAGE_AREAS)[keyof typeof STORAGE_AREAS];
