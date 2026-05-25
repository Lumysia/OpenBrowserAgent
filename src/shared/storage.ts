import { nanoid } from "nanoid";
import { normalizeAgents } from "./agents";
import { getBrowserApi } from "./browser-api";
import { BUILTIN_SKILLS } from "./builtin-skills";
import * as config from "./config";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import { normalizeLocalExecutionBridges } from "./local-execution-bridges";
import { normalizeMcpServers } from "./mcp";
import {
  areaForSyncEnabled,
  effectiveArea,
  otherStorageArea,
  STORAGE_AREAS,
  type AreaName,
} from "./storage-areas";
import type { StorageItem, StorageItemOptions } from "./storage-item-types";
import { makeStorageItemFactory } from "./storage-item-factory";
import {
  clearPendingSyncWrites,
  DEFAULT_SYNC_WRITE_STATUS,
  markSyncLocalCacheFlushed,
  flushPendingSyncWrites,
  queueSyncWrite,
  queueSyncRemove,
  readPendingSyncValue,
  readSyncLocalValue,
  removeSyncLocalCache,
  syncLocalCacheKey,
  type SyncLocalCache,
  type SyncWriteStatus,
  writeSyncLocalCache,
} from "./storage-sync-cache";
import {
  isBackendStorageChange,
  watchRemoteValue,
} from "./storage-remote-watch";
import {
  getActiveSyncBackend,
  isSyncBackendEnabled,
  NO_SYNC_BACKEND_ID,
  normalizeSyncBackends,
} from "./sync-backends";
import { offloadChatInlineAttachments } from "./sync-chat-attachments";
import { activateSyncBackend } from "./storage-sync-transition";
import { normalizeWorkspaces } from "./workspace";
import {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
  type SyncableDataKey,
  type SyncPreferenceKey,
} from "./storage-keys";
import { isEmptyStorageValue } from "./storage-value";
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

function syncableItemsForPreference(key: SyncPreferenceKey) {
  return SYNCABLE_DATA_ITEMS.filter((item) => item.preferenceKey === key);
}

async function setStoredValue<T>(area: AreaName, key: string, value: T) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    await getBrowserApi().storage.local.set({ [key]: value });
    return;
  }

  const backend = await getActiveSyncBackend();
  await writeSyncLocalCache(key, value);
  if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(value)) return;
  queueSyncWrite(backend, key, value, {
    delayMs: immediateSyncWriteDelay(key),
  }).catch(() => undefined);
}

async function setStoredValueNow<T>(area: AreaName, key: string, value: T) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    await getBrowserApi().storage.local.set({ [key]: value });
    return;
  }
  await markSyncLocalCacheFlushed(key, value);
}

async function removeStoredValue(area: AreaName, key: string) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    await getBrowserApi().storage.local.remove(key);
    return;
  }
  await removeSyncLocalCache(key);
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

function hasUnfinishedChatRun(value: unknown) {
  if (!Array.isArray(value)) return false;
  return (value as Chat[]).some((chat) =>
    chat.messages?.some((message) => {
      if (message.role !== "assistant") return false;
      const metrics = message.metadata?.runMetrics as
        | { startedAt?: unknown; endedAt?: unknown }
        | undefined;
      return metrics?.startedAt !== undefined && metrics.endedAt === undefined;
    }),
  );
}

async function readStoredValue<T>(area: AreaName, key: string) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    const result = await getBrowserApi().storage.local.get(key);
    return result[key] as T | undefined;
  }
  return readSyncLocalValue<T>(key);
}

async function readSyncedValue<T>(key: string) {
  return readStoredValue<T>(STORAGE_AREAS.sync, key);
}

async function readRemoteValue<T>(key: string) {
  if (!(await isSyncBackendEnabled())) return undefined;
  return (await getActiveSyncBackend()).read<T>(key);
}

async function writeRemoteValueNow<T>(key: string, value: T) {
  const backend = await getActiveSyncBackend();
  const mergedValue = await backend.write(key, value);
  await markSyncLocalCacheFlushed(key, mergedValue ?? value);
}

const { createItem, createMigratedItem } = makeStorageItemFactory({
  readStoredValue,
  setStoredValue,
  setStoredValueNow,
  removeStoredValue,
});

function createSwitchableItem<T>(
  key: string,
  init: () => T,
  syncPreferenceKey: SyncPreferenceKey,
  normalize?: (value: T) => T,
  options: StorageItemOptions = {},
): StorageItem<T> {
  const areaFor = (settings: SyncDataSettings): AreaName =>
    areaForSyncEnabled(settings[syncPreferenceKey] === true);

  async function activeArea() {
    return effectiveArea(areaFor(await storage.syncDataSettings.get()));
  }

  async function getValue() {
    const area = await activeArea();
    if (area === STORAGE_AREAS.sync) {
      const pending = await readPendingSyncValue<T>(key);
      if (pending !== undefined)
        return normalize ? normalize(pending) : pending;
    }
    const activeValue = await readFrom(area);
    if (activeValue !== undefined)
      return normalize ? normalize(activeValue) : activeValue;

    const inactiveValue =
      area === STORAGE_AREAS.sync
        ? await readFrom(otherStorageArea(area))
        : undefined;
    const rawValue = inactiveValue === undefined ? init() : inactiveValue;
    const value = normalize ? normalize(rawValue) : rawValue;
    await setStoredValueNow(area, key, value);
    return value;
  }

  async function readFrom(area: AreaName) {
    return readStoredValue<T>(area, key);
  }

  return {
    key,
    area: STORAGE_AREAS.local,
    persistDebounceMs: options.persistDebounceMs,
    snapshot: options.snapshot,
    get: getValue,
    async set(value) {
      const area = await activeArea();
      await setStoredValue(area, key, normalize ? normalize(value) : value);
      const inactiveArea = await effectiveArea(otherStorageArea(area));
      if (area === STORAGE_AREAS.sync && inactiveArea !== area)
        await removeStoredValue(inactiveArea, key);
    },
    async remove() {
      await Promise.all([
        removeStoredValue(STORAGE_AREAS.local, key),
        removeStoredValue(STORAGE_AREAS.sync, key),
      ]);
    },
    watch(callback) {
      let activeRemoteUnwatch: (() => void) | undefined;
      const setupRemoteWatch = async () => {
        activeRemoteUnwatch?.();
        activeRemoteUnwatch = watchRemoteValue<T>(key, async (change) => {
          if ((await activeArea()) !== STORAGE_AREAS.sync) return;
          if (change.newValue !== undefined) {
            await markSyncLocalCacheFlushed(key, change.newValue);
          } else {
            await removeSyncLocalCache(key);
          }
          callback(change.newValue as T, change.oldValue as T);
        });
      };
      setupRemoteWatch().catch(() => undefined);
      const listener = async (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
        if (isBackendStorageChange(key, changedArea)) return;
        const cacheChange = changes[syncLocalCacheKey(key)];
        const localCacheChanged = changedArea === STORAGE_AREAS.local;
        const syncDataSettingsCacheChanged =
          localCacheChanged &&
          changes[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)];
        const syncDataSettingsLocalChanged =
          localCacheChanged && changes[STORAGE_KEYS.syncDataSettings];
        const activeBackendChanged =
          localCacheChanged && changes[STORAGE_KEYS.activeSyncBackendId];

        if (
          !cacheChange &&
          !syncDataSettingsCacheChanged &&
          !syncDataSettingsLocalChanged &&
          !activeBackendChanged &&
          !changes[key]
        )
          return;

        if (activeBackendChanged) {
          const next = await getValue();
          callback(next, next);
          return;
        }

        if (syncDataSettingsCacheChanged || syncDataSettingsLocalChanged) {
          const settingsChange = (syncDataSettingsCacheChanged ||
            syncDataSettingsLocalChanged) as chrome.storage.StorageChange;
          const oldSettings = syncDataSettingsCacheChanged
            ? (
                settingsChange.oldValue as
                  | SyncLocalCache<SyncDataSettings>
                  | undefined
              )?.value
            : (settingsChange.oldValue as SyncDataSettings | undefined);
          const newSettings = syncDataSettingsCacheChanged
            ? (
                settingsChange.newValue as
                  | SyncLocalCache<SyncDataSettings>
                  | undefined
              )?.value
            : (settingsChange.newValue as SyncDataSettings | undefined);
          const oldArea = areaFor(
            mergeSyncDataSettings(oldSettings || DEFAULT_SYNC_DATA_SETTINGS),
          );
          const newArea = areaFor(
            mergeSyncDataSettings(newSettings || DEFAULT_SYNC_DATA_SETTINGS),
          );
          if (oldArea === newArea) return;
          await preserveValueForRemoteSyncDisable(oldArea, newArea);
          const next = await getValue();
          callback(next, next);
          return;
        }

        const area = await activeArea();
        if (area === STORAGE_AREAS.sync && localCacheChanged && cacheChange) {
          const next = cacheChange.newValue as SyncLocalCache<T> | undefined;
          const previous = cacheChange.oldValue as
            | SyncLocalCache<T>
            | undefined;
          if (next) callback(next.value, previous?.value as T);
          else callback(undefined as T, previous?.value as T);
          return;
        }
        if (changedArea !== area || !changes[key]) return;
        callback(changes[key].newValue as T, changes[key].oldValue as T);
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => {
        activeRemoteUnwatch?.();
        getBrowserApi().storage.onChanged.removeListener(listener);
      };
    },
  };

  async function preserveValueForRemoteSyncDisable(
    oldArea: AreaName,
    newArea: AreaName,
  ) {
    const fromArea = await effectiveArea(oldArea);
    const toArea = await effectiveArea(newArea);
    if (fromArea !== STORAGE_AREAS.sync || toArea !== STORAGE_AREAS.local)
      return;
    const [sourceValue, targetValue] = await Promise.all([
      readFrom(fromArea),
      readFrom(toArea),
    ]);
    if (sourceValue !== undefined && targetValue === undefined)
      await setStoredValueNow(toArea, key, sourceValue);
  }
}

export const storage = {
  userId: createItem<string>(STORAGE_AREAS.local, STORAGE_KEYS.userId, () =>
    nanoid(),
  ),
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
};

function createChatsStorageItem() {
  const item = createSwitchableItem<Chat[]>(
    STORAGE_KEYS.chats,
    () => [],
    SYNC_PREFERENCES.chats,
    undefined,
    { persistDebounceMs: config.CHAT_WRITE_DEBOUNCE_MS, snapshot: "hash" },
  );
  return {
    ...item,
    async set(value: Chat[]) {
      await item.set(await offloadChatInlineAttachments(value));
    },
  };
}

export async function getSyncedProviderState() {
  return readSyncedValue<ProviderState>(STORAGE_KEYS.provider);
}

export async function setDataSync(key: SyncPreferenceKey, enabled: boolean) {
  if (enabled && !(await isSyncBackendEnabled()))
    throw new Error("Enable a sync backend before syncing this data.");
  await Promise.all(
    syncableItemsForPreference(key).map((item) =>
      setDataKeySync(item.dataKey, enabled),
    ),
  );

  await storage.syncDataSettings.set({
    ...(await storage.syncDataSettings.get()),
    [key]: enabled,
  });
}

async function setDataKeySync(dataKey: SyncableDataKey, enabled: boolean) {
  const toAreaName = areaForSyncEnabled(enabled);
  const fromAreaName = otherStorageArea(toAreaName);
  const existingTarget = enabled
    ? await readRemoteValue(dataKey)
    : await readStoredValue(toAreaName, dataKey);
  const existingSource = await readStoredValue(fromAreaName, dataKey);
  const sourceValue =
    existingSource ??
    (enabled ? missingRemoteValueForSyncedKey(dataKey) : undefined);

  if (
    enabled &&
    sourceValue !== undefined &&
    !(existingTarget !== undefined && isEmptyStorageValue(sourceValue))
  ) {
    await writeRemoteValueNow(dataKey, sourceValue);
  } else if (enabled && existingTarget !== undefined) {
    await markSyncLocalCacheFlushed(dataKey, existingTarget);
  } else if (existingSource !== undefined) {
    await setStoredValueNow(toAreaName, dataKey, existingSource);
  }
}

function missingRemoteValueForSyncedKey(key: SyncableDataKey) {
  if (key === STORAGE_KEYS.localExecutionBridges) return [];
  return undefined;
}

export async function setActiveSyncBackend(backendId: string) {
  await flushPendingSyncWrites();
  if (backendId === NO_SYNC_BACKEND_ID) {
    await disableDataSync();
    return;
  }

  await activateSyncBackend({
    backendId,
    getLanguage: storage.language.get,
    getPreferences: storage.preferences.get,
    getSyncDataSettings: storage.syncDataSettings.get,
    readSyncedValue,
    setActiveBackendId: storage.activeSyncBackendId.set,
  });
}

async function disableDataSync() {
  const language = await readSyncedValue<string>(STORAGE_KEYS.language);
  const preferences = await storage.preferences.get();
  const localSyncDataSettings = mergeSyncDataSettings({});
  const dataSnapshots = await Promise.all(
    SYNCABLE_DATA_ITEMS.map(async (item) => ({
      ...item,
      value: await readSyncedValue(item.dataKey),
    })),
  );

  if (language !== undefined)
    await setStoredValueNow(
      STORAGE_AREAS.local,
      STORAGE_KEYS.language,
      language,
    );
  await setStoredValueNow(
    STORAGE_AREAS.local,
    STORAGE_KEYS.preferences,
    preferences,
  );
  await setStoredValueNow(
    STORAGE_AREAS.local,
    STORAGE_KEYS.syncDataSettings,
    localSyncDataSettings,
  );
  await removeSyncLocalCache(STORAGE_KEYS.syncDataSettings);
  for (const item of dataSnapshots) {
    if (item.value !== undefined)
      await setStoredValueNow(STORAGE_AREAS.local, item.dataKey, item.value);
  }
  await storage.activeSyncBackendId.set(NO_SYNC_BACKEND_ID);
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
