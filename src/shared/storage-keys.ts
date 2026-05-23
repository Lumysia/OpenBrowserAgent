export const STORAGE_KEYS = {
  userId: "userId",
  language: "language",
  preferences: "preferences",
  provider: "provider",
  agents: "agents",
  agentWorkspaces: "agent-workspaces",
  skills: "skills",
  mcpServers: "mcp-servers",
  shouldShowUpdateToast: "should-show-update-toast",
  chats: "chats",
  chatTabs: "chat-tabs",
  syncWriteStatus: "sync-write-status",
  syncBackends: "sync-backends",
  activeSyncBackendId: "active-sync-backend-id",
  ignoreSyncedProvidersForBootstrap: "ignore-synced-providers-for-bootstrap",
} as const;

export const SYNCABLE_DATA_ITEMS = [
  { preferenceKey: "syncProviders", dataKey: STORAGE_KEYS.provider },
  { preferenceKey: "syncAgents", dataKey: STORAGE_KEYS.agents },
  { preferenceKey: "syncSkills", dataKey: STORAGE_KEYS.skills },
  { preferenceKey: "syncMcpServers", dataKey: STORAGE_KEYS.mcpServers },
  { preferenceKey: "syncChats", dataKey: STORAGE_KEYS.chats },
] as const;

export type SyncPreferenceKey =
  (typeof SYNCABLE_DATA_ITEMS)[number]["preferenceKey"];

export type SyncableDataKey = (typeof SYNCABLE_DATA_ITEMS)[number]["dataKey"];
