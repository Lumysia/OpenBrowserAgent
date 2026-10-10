import { normalizeAgents } from "./agents";
import { getBrowserApi } from "./browser-api";
import {
  chatSnapshot,
  hasUnfinishedChatRun,
  normalizeChats,
  reconcileChatSnapshots,
} from "./chats";
import { BUILTIN_SKILLS } from "./builtin-skills";
import * as config from "./config";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import { normalizeLocalExecutionBridges } from "./local-execution-bridges";
import { normalizeMcpServers } from "./mcp";
import { normalizeSkills } from "./skills";
import { effectiveArea, STORAGE_AREAS, type AreaName } from "./storage-areas";
import type { StorageItem } from "./storage-item-types";
import { makeStorageItemFactory } from "./storage-item-factory";
import { makeSwitchableItemFactory } from "./storage-switchable-item";
import { stageSyncRemoval } from "./storage-sync-local";
import { withStoragePublicationLock } from "./storage-lock";
import {
  clearPendingSyncWrites,
  DEFAULT_SYNC_WRITE_STATUS,
  flushPendingSyncWrites,
  queueSyncWrite,
  queueSyncRemove,
  readSyncLocalValue,
  syncLocalCacheKey,
  type SyncWriteStatus,
  writeSyncLocalCache,
} from "./storage-sync-cache";
import {
  getActiveSyncBackend,
  NO_SYNC_BACKEND_ID,
  normalizeSyncBackends,
} from "./sync-backends";
import { offloadChatInlineAttachments } from "./sync-chat-attachments";
import { readSyncedValue } from "./storage-sync-settings";
export { setActiveSyncBackend, setDataSync } from "./storage-sync-settings";
import { normalizeWorkspaces } from "./workspace";
import {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
  type SyncPreferenceKey,
} from "./storage-keys";
import {
  DEFAULT_SYNC_DATA_SETTINGS,
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";
import type {
  Agent,
  AgentWorkspace,
  Chat,
  ChatTab,
  Preferences,
  ProviderState,
  Skill,
  McpServerConfig,
  LocalExecutionBridgeConfig,
  SyncBackendConfig,
} from "./types";

export {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
};
export type { SyncDataSettings, SyncPreferenceKey };

export { getBrowserApi };
export {
  clearPendingSyncWrites,
  flushPendingSyncWrites,
  syncLocalCacheKey,
  type SyncWriteStatus,
};

async function setStoredValue<T>(area: AreaName, key: string, value: T) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    await withStoragePublicationLock(() =>
      getBrowserApi().storage.local.set({ [key]: value }),
    );
    return;
  }

  const backend = await getActiveSyncBackend();
  await writeSyncLocalCache(key, value);
  if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(value)) return;
  queueSyncWrite(backend, key, value, {
    delayMs: immediateSyncWriteDelay(key),
  }).catch(() => undefined);
}

async function removeStoredValue(area: AreaName, key: string) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    await withStoragePublicationLock(() =>
      getBrowserApi().storage.local.remove(key),
    );
    return;
  }
  await stageSyncRemoval(key);
  queueSyncRemove(await getActiveSyncBackend(), key, {
    delayMs: immediateSyncWriteDelay(key),
  }).catch(() => undefined);
}

function immediateSyncWriteDelay(key: string) {
  if (key === STORAGE_KEYS.language || key === STORAGE_KEYS.preferences)
    return 0;
  if (key === STORAGE_KEYS.syncDataSettings) return 0;
  if (key === STORAGE_KEYS.chats) return config.CHAT_SYNC_WRITE_DEBOUNCE_MS;
  return undefined;
}

async function readStoredValue<T>(area: AreaName, key: string) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    const result = await getBrowserApi().storage.local.get(key);
    return result[key] as T | undefined;
  }
  return readSyncLocalValue<T>(key);
}

const itemIo = {
  readStoredValue,
  setStoredValue,
  removeStoredValue,
};
const { createItem, createMigratedItem } = makeStorageItemFactory(itemIo);
const createSwitchableItem = makeSwitchableItemFactory(itemIo, async () =>
  mergeSyncDataSettings(
    await readSyncedValue<SyncDataSettings>(STORAGE_KEYS.syncDataSettings),
  ),
);

export const storage = {
  language: createItem<string>(
    STORAGE_AREAS.sync,
    STORAGE_KEYS.language,
    () => getBrowserApi().i18n?.getUILanguage?.() || "en-US",
  ),
  preferences: createMigratedItem<Preferences>(
    STORAGE_AREAS.sync,
    STORAGE_AREAS.local,
    STORAGE_KEYS.preferences,
    () => DEFAULT_PREFERENCES,
    mergePreferences,
  ),
  provider: createSwitchableItem<ProviderState>(
    STORAGE_KEYS.provider,
    () => ({}),
    SYNC_PREFERENCES.providers,
  ),
  agents: createSwitchableItem<Agent[]>(
    STORAGE_KEYS.agents,
    () => normalizeAgents(undefined),
    SYNC_PREFERENCES.agents,
    normalizeAgents,
  ),
  agentWorkspaces: createSwitchableItem<AgentWorkspace[]>(
    STORAGE_KEYS.agentWorkspaces,
    () => [],
    SYNC_PREFERENCES.agents,
    normalizeWorkspaces,
  ),
  skills: createSwitchableItem<Skill[]>(
    STORAGE_KEYS.skills,
    () => BUILTIN_SKILLS,
    SYNC_PREFERENCES.skills,
    normalizeSkills,
  ),
  mcpServers: createSwitchableItem<McpServerConfig[]>(
    STORAGE_KEYS.mcpServers,
    () => [],
    SYNC_PREFERENCES.mcpServers,
    normalizeMcpServers,
  ),
  localExecutionBridges: createSwitchableItem<LocalExecutionBridgeConfig[]>(
    STORAGE_KEYS.localExecutionBridges,
    () => [],
    SYNC_PREFERENCES.localExecutionBridges,
    normalizeLocalExecutionBridges,
  ),
  shouldShowUpdateToast: createItem<boolean>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.shouldShowUpdateToast,
    () => false,
  ),
  chats: createChatsStorageItem(),
  chatTabs: createItem<ChatTab[]>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.chatTabs,
    () => [],
  ),
  syncWriteStatus: createItem<SyncWriteStatus>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.syncWriteStatus,
    () => DEFAULT_SYNC_WRITE_STATUS,
  ),
  syncBackends: createItem<SyncBackendConfig[]>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.syncBackends,
    () => normalizeSyncBackends(undefined),
    normalizeSyncBackends,
  ),
  activeSyncBackendId: createItem<string>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.activeSyncBackendId,
    () => NO_SYNC_BACKEND_ID,
  ),
  syncDataSettings: createItem<SyncDataSettings>(
    STORAGE_AREAS.sync,
    STORAGE_KEYS.syncDataSettings,
    () => DEFAULT_SYNC_DATA_SETTINGS,
    mergeSyncDataSettings,
  ),
  ignoreSyncedProvidersForBootstrap: createItem<boolean>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.ignoreSyncedProvidersForBootstrap,
    () => false,
  ),
  debugLoggingEnabled: createItem<boolean>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.debugLoggingEnabled,
    () => false,
  ),
};

function createChatsStorageItem() {
  const item = createSwitchableItem<Chat[]>(
    STORAGE_KEYS.chats,
    () => [],
    SYNC_PREFERENCES.chats,
    normalizeChats,
    {
      persistDebounceMs: (value) =>
        hasUnfinishedChatRun(value)
          ? config.CHAT_STREAM_WRITE_DEBOUNCE_MS
          : config.CHAT_WRITE_DEBOUNCE_MS,
      snapshot: (value) => chatSnapshot(value as Chat[]),
    },
  );
  return {
    ...item,
    reconcile: reconcileChatSnapshots,
    async set(value: Chat[]) {
      await item.set(await offloadChatInlineAttachments(value));
    },
  };
}

export async function getSyncedProviderState() {
  return readSyncedValue<ProviderState>(STORAGE_KEYS.provider);
}

export async function updateStoredArray<T extends { id: string }>(
  item: StorageItem<T[]>,
  updater: (items: T[]) => T[],
) {
  const items = await item.get();
  const next = updater(items);
  await item.set(next);
  return next;
}
