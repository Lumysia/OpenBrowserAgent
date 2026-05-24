export const STORAGE_KEYS = {
  userId: "userId",
  language: "language",
  preferences: "preferences",
  provider: "provider",
  agents: "agents",
  agentWorkspaces: "agent-workspaces",
  skills: "skills",
  mcpServers: "mcp-servers",
  localAgents: "local-agents",
  shouldShowUpdateToast: "should-show-update-toast",
  chats: "chats",
  chatTabs: "chat-tabs",
  syncWriteStatus: "sync-write-status",
  syncBackends: "sync-backends",
  activeSyncBackendId: "active-sync-backend-id",
  syncDataSettings: "sync-data-settings",
  ignoreSyncedProvidersForBootstrap: "ignore-synced-providers-for-bootstrap",
} as const;

export const SYNC_PREFERENCES = {
  providers: "syncProviders",
  agents: "syncAgents",
  skills: "syncSkills",
  mcpServers: "syncMcpServers",
  localAgents: "syncLocalAgents",
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
    preferenceKey: SYNC_PREFERENCES.mcpServers,
    dataKey: STORAGE_KEYS.mcpServers,
  },
  {
    preferenceKey: SYNC_PREFERENCES.localAgents,
    dataKey: STORAGE_KEYS.localAgents,
  },
  { preferenceKey: SYNC_PREFERENCES.chats, dataKey: STORAGE_KEYS.chats },
] as const;

export type SyncPreferenceKey =
  (typeof SYNCABLE_DATA_ITEMS)[number]["preferenceKey"];

export type SyncableDataKey = (typeof SYNCABLE_DATA_ITEMS)[number]["dataKey"];

export const SYNC_PREFERENCE_KEYS = Array.from(
  new Set(SYNCABLE_DATA_ITEMS.map((item) => item.preferenceKey)),
) as SyncPreferenceKey[];
