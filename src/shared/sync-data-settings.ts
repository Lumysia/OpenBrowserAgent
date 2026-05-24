import { SYNC_PREFERENCES, type SyncPreferenceKey } from "./storage-keys";

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
