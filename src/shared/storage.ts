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
import {
  areaForSyncEnabled,
  effectiveArea,
  otherStorageArea,
  STORAGE_AREAS,
  type AreaName,
} from "./storage-areas";
import type { StorageItem, StorageItemOptions } from "./storage-item-types";
import { makeStorageItemFactory } from "./storage-item-factory";
import { withStorageMutationLock } from "./storage-lock";
import { stageSyncRemoval } from "./storage-sync-local";
import {
  clearPendingSyncWrites,
  DEFAULT_SYNC_WRITE_STATUS,
  markSyncLocalCacheFlushed,
  flushPendingSyncWrites,
  queueSyncWrite,
  queueSyncRemove,
  readSyncLocalCache,
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

async function removeStoredValue(area: AreaName, key: string) {
  area = await effectiveArea(area);
  if (area === STORAGE_AREAS.local) {
    await getBrowserApi().storage.local.remove(key);
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

const { createItem, createMigratedItem } = makeStorageItemFactory({
  readStoredValue,
  setStoredValue,
  removeStoredValue,
});

function createSwitchableItem<T>(
  key: string,
  init: () => T,
  syncPreferenceKey: SyncPreferenceKey,
  normalize?: (value: T) => T,
  options: StorageItemOptions = {},
): StorageItem<T> & { update: (updater: (current: T) => T) => Promise<T> } {
  const areaFor = (settings: SyncDataSettings): AreaName =>
    areaForSyncEnabled(settings[syncPreferenceKey] === true);

  const normalizeValue = (value: T) => (normalize ? normalize(value) : value);
  const normalizeOptionalValue = (value: T | undefined) =>
    value === undefined ? undefined : normalizeValue(value);

  async function activeArea() {
    return effectiveArea(areaFor(await storage.syncDataSettings.get()));
  }

  async function getValue() {
    const area = await activeArea();
    const expected =
      area === STORAGE_AREAS.sync
        ? await readSyncLocalCache<T>(key)
        : undefined;
    if (expected && expected.flushedAt === undefined)
      return expected.removed ? init() : normalizeValue(expected.value);
    const activeValue = await readFrom(area);
    if (activeValue !== undefined) return normalizeValue(activeValue);

    const inactiveValue =
      area === STORAGE_AREAS.sync
        ? await readFrom(otherStorageArea(area))
        : undefined;
    const rawValue = inactiveValue === undefined ? init() : inactiveValue;
    const value = normalizeValue(rawValue);
    // A missing-key read supplies defaults without writing over an edit that
    // another context may have persisted while this read was in flight.
    if (area === STORAGE_AREAS.sync)
      await markSyncLocalCacheFlushed(key, value, { expected });
    return value;
  }

  async function readFrom(area: AreaName) {
    return readStoredValue<T>(area, key);
  }

  async function setValue(value: T) {
    const area = await activeArea();
    await setStoredValue(area, key, normalizeValue(value));
    const inactiveArea = await effectiveArea(otherStorageArea(area));
    if (area === STORAGE_AREAS.sync && inactiveArea !== area)
      await removeStoredValue(inactiveArea, key);
  }

  return {
    key,
    area: STORAGE_AREAS.local,
    persistDebounceMs: options.persistDebounceMs,
    snapshot: options.snapshot,
    get: getValue,
    async set(value) {
      await withStorageMutationLock(() => setValue(value));
    },
    update(updater) {
      return withStorageMutationLock(async () => {
        const current = await getValue();
        const next = updater(current);
        if (next !== current) await setValue(next);
        return next;
      });
    },
    async remove() {
      await withStorageMutationLock(() =>
        Promise.all([
          removeStoredValue(STORAGE_AREAS.local, key),
          removeStoredValue(STORAGE_AREAS.sync, key),
        ]),
      );
    },
    watch(callback) {
      let activeRemoteUnwatch: (() => void) | undefined;
      const setupRemoteWatch = async () => {
        activeRemoteUnwatch?.();
        activeRemoteUnwatch = watchRemoteValue<T>(
          key,
          async (change, backendId) => {
            if ((await activeArea()) !== STORAGE_AREAS.sync) return;
            const expected = await readSyncLocalCache<T>(key);
            if (expected && expected.flushedAt === undefined) return;
            const newValue = normalizeOptionalValue(
              change.newValue as T | undefined,
            );
            const oldValue = normalizeOptionalValue(
              change.oldValue as T | undefined,
            );
            const published =
              change.newValue !== undefined
                ? await markSyncLocalCacheFlushed(key, newValue as T, {
                    expected,
                    backendId,
                  })
                : await removeSyncLocalCache(key, { expected, backendId });
            if (published) callback(newValue as T, oldValue as T);
          },
        );
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
                  SyncLocalCache<SyncDataSettings> | undefined
              )?.value
            : (settingsChange.oldValue as SyncDataSettings | undefined);
          const newSettings = syncDataSettingsCacheChanged
            ? (
                settingsChange.newValue as
                  SyncLocalCache<SyncDataSettings> | undefined
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
            SyncLocalCache<T> | undefined;
          const oldValue = normalizeOptionalValue(
            previous?.value as T | undefined,
          );
          if (next)
            callback(normalizeOptionalValue(next.value) as T, oldValue as T);
          else callback(undefined as T, oldValue as T);
          return;
        }
        if (changedArea !== area || !changes[key]) return;
        callback(
          normalizeOptionalValue(changes[key].newValue as T | undefined) as T,
          normalizeOptionalValue(changes[key].oldValue as T | undefined) as T,
        );
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
    await withStorageMutationLock(async () => {
      const fromArea = await effectiveArea(oldArea);
      const toArea = await effectiveArea(newArea);
      if (fromArea !== STORAGE_AREAS.sync || toArea !== STORAGE_AREAS.local)
        return;
      const [sourceValue, targetValue] = await Promise.all([
        readFrom(fromArea),
        readFrom(toArea),
      ]);
      if (sourceValue !== undefined && targetValue === undefined)
        await setStoredValue(toArea, key, normalizeValue(sourceValue));
    });
  }
}

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
