import { nanoid } from "nanoid";
import { normalizeAgents } from "./agents";
import { BUILTIN_SKILLS } from "./builtin-skills";
import * as config from "./config";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import {
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  type SyncableDataKey,
  type SyncPreferenceKey,
} from "./storage-keys";
import type {
  Agent,
  Chat,
  ChatTab,
  Preferences,
  ProviderState,
  Skill,
} from "./types";

const STORAGE_AREAS = {
  local: "local",
  sync: "sync",
} as const;

type AreaName = (typeof STORAGE_AREAS)[keyof typeof STORAGE_AREAS];

export { STORAGE_KEYS, SYNCABLE_DATA_ITEMS, type SyncPreferenceKey };

type StorageItem<T> = {
  key: string;
  area: AreaName;
  persistDebounceMs?: number;
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

type StorageItemOptions = {
  persistDebounceMs?: number;
};

const SYNC_QUOTA_ERROR_PREFIX = "Sync item exceeds the safe per-item limit";

export type SyncWriteStatus = {
  pendingCount: number;
  lastUpdatedAt?: number;
  lastFlushedAt?: number;
  lastError?: string;
};

type PendingSyncWrite = {
  timeoutId: ReturnType<typeof setTimeout>;
  value: unknown;
  resolve: Array<() => void>;
  reject: Array<(error: unknown) => void>;
};

type SyncLocalCache<T> = {
  value: T;
  updatedAt: number;
  flushedAt?: number;
};

const pendingSyncWrites = new Map<string, PendingSyncWrite>();

const DEFAULT_SYNC_WRITE_STATUS: SyncWriteStatus = { pendingCount: 0 };

export function getBrowserApi() {
  const apiGlobal = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  return apiGlobal.browser ?? apiGlobal.chrome ?? chrome;
}

function areaForSyncEnabled(enabled: boolean): AreaName {
  return enabled ? STORAGE_AREAS.sync : STORAGE_AREAS.local;
}

function otherStorageArea(area: AreaName): AreaName {
  return area === STORAGE_AREAS.sync ? STORAGE_AREAS.local : STORAGE_AREAS.sync;
}

function syncableItemForPreference(key: SyncPreferenceKey) {
  return SYNCABLE_DATA_ITEMS.find((item) => item.preferenceKey === key)!;
}

async function setStoredValue<T>(area: AreaName, key: string, value: T) {
  if (area === STORAGE_AREAS.local) {
    await getBrowserApi().storage.local.set({ [key]: value });
    return;
  }

  assertSyncItemFits(key, value);
  await writeSyncLocalCache(key, value);

  await new Promise<void>((resolve, reject) => {
    const pending = pendingSyncWrites.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.value = value;
      pending.resolve.push(resolve);
      pending.reject.push(reject);
      pending.timeoutId = setTimeout(
        () => flushSyncWrite(key),
        config.SYNC_WRITE_DEBOUNCE_MS,
      );
      updateSyncWriteStatus().catch(() => undefined);
      return;
    }

    pendingSyncWrites.set(key, {
      value,
      resolve: [resolve],
      reject: [reject],
      timeoutId: setTimeout(
        () => flushSyncWrite(key),
        config.SYNC_WRITE_DEBOUNCE_MS,
      ),
    });
    updateSyncWriteStatus().catch(() => undefined);
  });
}

async function setStoredValueNow<T>(area: AreaName, key: string, value: T) {
  if (area === STORAGE_AREAS.sync) assertSyncItemFits(key, value);
  await getBrowserApi().storage[area].set({ [key]: value });
}

function assertSyncItemFits(key: string, value: unknown) {
  const size = new TextEncoder().encode(
    JSON.stringify({ [key]: value }),
  ).length;
  if (size <= config.SYNC_MAX_BYTES_PER_ITEM) return;
  throw new Error(
    `${SYNC_QUOTA_ERROR_PREFIX}: "${key}" is ${size} bytes; limit is ${config.SYNC_MAX_BYTES_PER_ITEM} bytes. Keep this data local or remove old entries before enabling sync.`,
  );
}

async function flushSyncWrite(key: string) {
  const pending = pendingSyncWrites.get(key);
  if (!pending) return;
  pendingSyncWrites.delete(key);
  try {
    await getBrowserApi().storage.sync.set({ [key]: pending.value });
    await markSyncLocalCacheFlushed(key, pending.value);
    await updateSyncWriteStatus({ lastFlushedAt: Date.now(), lastError: "" });
    pending.resolve.forEach((resolve) => resolve());
  } catch (error) {
    await updateSyncWriteStatus({
      lastError: error instanceof Error ? error.message : String(error),
    });
    pending.reject.forEach((reject) => reject(error));
  }
}

export function syncLocalCacheKey(key: string) {
  return `${key}:sync-local-cache`;
}

export function clearPendingSyncWrites() {
  for (const pending of pendingSyncWrites.values()) {
    clearTimeout(pending.timeoutId);
    pending.resolve.forEach((resolve) => resolve());
  }
  pendingSyncWrites.clear();
}

async function writeSyncLocalCache<T>(key: string, value: T) {
  await getBrowserApi().storage.local.set({
    [syncLocalCacheKey(key)]: {
      value,
      updatedAt: Date.now(),
    } satisfies SyncLocalCache<T>,
  });
}

async function markSyncLocalCacheFlushed<T>(key: string, value: T) {
  const existing = await readSyncLocalCache<T>(key);
  if (
    existing?.flushedAt !== undefined &&
    sameStorageValue(existing.value, value)
  )
    return;
  const now = Date.now();
  await getBrowserApi().storage.local.set({
    [syncLocalCacheKey(key)]: {
      value,
      updatedAt: now,
      flushedAt: now,
    } satisfies SyncLocalCache<T>,
  });
}

function sameStorageValue(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return Object.is(left, right);
  }
}

async function readSyncLocalCache<T>(key: string) {
  const result = await getBrowserApi().storage.local.get(
    syncLocalCacheKey(key),
  );
  return result[syncLocalCacheKey(key)] as SyncLocalCache<T> | undefined;
}

async function updateSyncWriteStatus(patch: Partial<SyncWriteStatus> = {}) {
  await getBrowserApi().storage.local.set({
    [STORAGE_KEYS.syncWriteStatus]: {
      pendingCount: pendingSyncWrites.size,
      lastUpdatedAt: Date.now(),
      ...patch,
    } satisfies SyncWriteStatus,
  });
}

function createItem<T>(
  area: AreaName,
  key: string,
  init: () => T,
  normalize?: (value: T) => T,
  options: StorageItemOptions = {},
): StorageItem<T> {
  const storageKey = key;
  const storageArea = () => getBrowserApi().storage[area];

  return {
    key: storageKey,
    area,
    persistDebounceMs: options.persistDebounceMs,
    async get() {
      if (area === STORAGE_AREAS.sync) {
        const cache = await readSyncLocalCache<T>(storageKey);
        if (cache && cache.flushedAt === undefined) return cache.value;
      }
      const result = await storageArea().get(storageKey);
      if (result[storageKey] === undefined) {
        const initialValue = init();
        await setStoredValueNow(area, storageKey, initialValue);
        if (area === STORAGE_AREAS.sync)
          await markSyncLocalCacheFlushed(storageKey, initialValue);
        return initialValue;
      }
      const value = normalize
        ? normalize(result[storageKey] as T)
        : (result[storageKey] as T);
      if (area === STORAGE_AREAS.sync)
        await markSyncLocalCacheFlushed(storageKey, value);
      return value;
    },
    async set(value) {
      await setStoredValue(
        area,
        storageKey,
        normalize ? normalize(value) : value,
      );
    },
    async remove() {
      await storageArea().remove(storageKey);
    },
    watch(callback) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
        if (
          area === STORAGE_AREAS.sync &&
          changedArea === STORAGE_AREAS.local &&
          changes[syncLocalCacheKey(storageKey)]
        ) {
          const next = changes[syncLocalCacheKey(storageKey)].newValue as
            | SyncLocalCache<T>
            | undefined;
          const previous = changes[syncLocalCacheKey(storageKey)].oldValue as
            | SyncLocalCache<T>
            | undefined;
          if (!next) return;
          callback(next.value, previous?.value as T);
          return;
        }
        if (changedArea !== area || !changes[storageKey]) return;
        callback(
          changes[storageKey].newValue as T,
          changes[storageKey].oldValue as T,
        );
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
}

function createMigratedItem<T>(
  area: AreaName,
  fallbackArea: AreaName,
  key: string,
  init: () => T,
  merge?: (value: T) => T,
): StorageItem<T> {
  const item = createItem(area, key, init);
  const fallbackItem = createItem(fallbackArea, key, init);
  return {
    ...item,
    async get() {
      const api = getBrowserApi();
      if (area === STORAGE_AREAS.sync) {
        const cache = await readSyncLocalCache<T>(key);
        if (cache && cache.flushedAt === undefined)
          return merge ? merge(cache.value) : cache.value;
      }
      const result = await api.storage[area].get(key);
      if (result[key] !== undefined) {
        const value = merge ? merge(result[key] as T) : (result[key] as T);
        if (area === STORAGE_AREAS.sync)
          await markSyncLocalCacheFlushed(key, value);
        return value;
      }

      const fallback = await api.storage[fallbackArea].get(key);
      const initialValue =
        fallback[key] === undefined ? init() : (fallback[key] as T);
      const value = merge ? merge(initialValue) : initialValue;
      await setStoredValueNow(area, key, value);
      if (area === STORAGE_AREAS.sync)
        await markSyncLocalCacheFlushed(key, value);
      return value;
    },
  };
}

function createSwitchableItem<T>(
  key: string,
  init: () => T,
  syncPreferenceKey: SyncPreferenceKey,
  normalize?: (value: T) => T,
  options: StorageItemOptions = {},
): StorageItem<T> {
  const areaFor = (preferences: Preferences): AreaName =>
    areaForSyncEnabled(preferences[syncPreferenceKey] === true);

  async function activeArea() {
    return areaFor(await storage.preferences.get());
  }

  async function getValue() {
    const area = await activeArea();
    const activeValue = await readFrom(area);
    if (activeValue !== undefined)
      return normalize ? normalize(activeValue) : activeValue;

    const inactiveValue = await readFrom(otherStorageArea(area));
    const rawValue = inactiveValue === undefined ? init() : inactiveValue;
    const value = normalize ? normalize(rawValue) : rawValue;
    await setStoredValueNow(area, key, value);
    return value;
  }

  async function readFrom(area: AreaName) {
    const result = await getBrowserApi().storage[area].get(key);
    return result[key] as T | undefined;
  }

  return {
    key,
    area: STORAGE_AREAS.local,
    persistDebounceMs: options.persistDebounceMs,
    get: getValue,
    async set(value) {
      const area = await activeArea();
      await setStoredValue(area, key, normalize ? normalize(value) : value);
      await getBrowserApi().storage[otherStorageArea(area)].remove(key);
    },
    async remove() {
      await Promise.all([
        getBrowserApi().storage.local.remove(key),
        getBrowserApi().storage.sync.remove(key),
      ]);
    },
    watch(callback) {
      const listener = async (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
        const cacheChange = changes[syncLocalCacheKey(key)];
        const localCacheChanged = changedArea === STORAGE_AREAS.local;
        const preferencesCacheChanged =
          localCacheChanged &&
          changes[syncLocalCacheKey(STORAGE_KEYS.preferences)];

        if (!cacheChange && !preferencesCacheChanged && !changes[key]) return;

        if (preferencesCacheChanged) {
          const preferenceChange =
            preferencesCacheChanged as chrome.storage.StorageChange;
          const oldPreferences = (
            preferenceChange.oldValue as SyncLocalCache<Preferences> | undefined
          )?.value;
          const newPreferences = (
            preferenceChange.newValue as SyncLocalCache<Preferences> | undefined
          )?.value;
          const oldArea = areaFor(oldPreferences || DEFAULT_PREFERENCES);
          const newArea = areaFor(newPreferences || DEFAULT_PREFERENCES);
          if (oldArea === newArea) return;
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
          return;
        }
        if (changedArea !== area || !changes[key]) return;
        callback(changes[key].newValue as T, changes[key].oldValue as T);
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
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
    "syncProviders",
  ),
  agents: createSwitchableItem<Agent[]>(
    STORAGE_KEYS.agents,
    () => normalizeAgents(undefined),
    "syncAgents",
    normalizeAgents,
  ),
  skills: createSwitchableItem<Skill[]>(
    STORAGE_KEYS.skills,
    () => BUILTIN_SKILLS,
    "syncSkills",
  ),
  shouldShowUpdateToast: createItem<boolean>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.shouldShowUpdateToast,
    () => false,
  ),
  chats: createSwitchableItem<Chat[]>(
    STORAGE_KEYS.chats,
    () => [],
    "syncChats",
    undefined,
    { persistDebounceMs: config.CHAT_WRITE_DEBOUNCE_MS },
  ),
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
  ignoreSyncedProvidersForBootstrap: createItem<boolean>(
    STORAGE_AREAS.local,
    STORAGE_KEYS.ignoreSyncedProvidersForBootstrap,
    () => false,
  ),
};

export async function getSyncedProviderState() {
  const result = await getBrowserApi().storage.sync.get(STORAGE_KEYS.provider);
  return result[STORAGE_KEYS.provider] as ProviderState | undefined;
}

export async function setDataSync(key: SyncPreferenceKey, enabled: boolean) {
  const dataKey: SyncableDataKey = syncableItemForPreference(key).dataKey;
  const api = getBrowserApi();
  const toAreaName = areaForSyncEnabled(enabled);
  const fromAreaName = otherStorageArea(toAreaName);
  const fromArea = api.storage[fromAreaName];
  const toArea = api.storage[toAreaName];
  const existingTarget = await toArea.get(dataKey);
  const existingSource = await fromArea.get(dataKey);

  if (
    existingTarget[dataKey] === undefined &&
    existingSource[dataKey] !== undefined
  )
    await setStoredValueNow(toAreaName, dataKey, existingSource[dataKey]);

  await fromArea.remove(dataKey);
  await updateStoredValue(storage.preferences, (preferences) => ({
    ...preferences,
    [key]: enabled,
  }));
}

async function updateStoredValue<T>(
  item: StorageItem<T>,
  updater: (value: T) => T,
) {
  await item.set(updater(await item.get()));
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
