import type { SyncPreferenceKey } from "./storage-keys";

export type SyncDataSettings = Record<SyncPreferenceKey, boolean> & {
  syncChatAttachments: boolean;
};

export const DEFAULT_SYNC_DATA_SETTINGS: SyncDataSettings = {
  syncProviders: false,
  syncAgents: false,
  syncSkills: false,
  syncMcpServers: false,
  syncChats: false,
  syncChatAttachments: false,
};

export function mergeSyncDataSettings(
  value: Partial<SyncDataSettings> | undefined,
): SyncDataSettings {
  return { ...DEFAULT_SYNC_DATA_SETTINGS, ...value };
}
