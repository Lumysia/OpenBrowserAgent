import { nanoid } from "nanoid";
import { SYNC_MAX_BYTES_PER_ITEM, SYNC_WRITE_DEBOUNCE_MS } from "./config";
import type {
  Chat,
  ChatTab,
  Preferences,
  ProviderState,
  QuickAction,
} from "./types";

const STORAGE_AREAS = {
  local: "local",
  sync: "sync",
} as const;

type AreaName = (typeof STORAGE_AREAS)[keyof typeof STORAGE_AREAS];

const STORAGE_KEYS = {
  userId: "userId",
  language: "language",
  preferences: "preferences",
  provider: "provider",
  quickAction: "quick-action",
  shouldShowUpdateToast: "should-show-update-toast",
  chats: "chats",
  chatTabs: "chat-tabs",
  syncWriteStatus: "sync-write-status",
} as const;

export const SYNCABLE_DATA_ITEMS = [
  { preferenceKey: "syncProviders", dataKey: STORAGE_KEYS.provider },
  { preferenceKey: "syncQuickActions", dataKey: STORAGE_KEYS.quickAction },
  { preferenceKey: "syncChats", dataKey: STORAGE_KEYS.chats },
] as const;

export type SyncPreferenceKey =
  (typeof SYNCABLE_DATA_ITEMS)[number]["preferenceKey"];

type SyncableDataKey = (typeof SYNCABLE_DATA_ITEMS)[number]["dataKey"];

type StorageItem<T> = {
  key: string;
  area: AreaName;
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
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

const pendingSyncWrites = new Map<string, PendingSyncWrite>();

const DEFAULT_SYNC_WRITE_STATUS: SyncWriteStatus = { pendingCount: 0 };

const DEFAULT_PREFERENCES: Preferences = {
  colorScheme: "system",
  accentColor: "amber",
  syncSettings: true,
  syncProviders: false,
  syncQuickActions: false,
  syncChats: false,
  autoScroll: true,
  autoRetry: true,
  maxToolSteps: 30,
};

function getBrowserApi() {
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

  await new Promise<void>((resolve, reject) => {
    const pending = pendingSyncWrites.get(key);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.value = value;
      pending.resolve.push(resolve);
      pending.reject.push(reject);
      pending.timeoutId = setTimeout(
        () => flushSyncWrite(key),
        SYNC_WRITE_DEBOUNCE_MS,
      );
      updateSyncWriteStatus().catch(() => undefined);
      return;
    }

    pendingSyncWrites.set(key, {
      value,
      resolve: [resolve],
      reject: [reject],
      timeoutId: setTimeout(() => flushSyncWrite(key), SYNC_WRITE_DEBOUNCE_MS),
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
  if (size <= SYNC_MAX_BYTES_PER_ITEM) return;
  throw new Error(
    `${SYNC_QUOTA_ERROR_PREFIX}: "${key}" is ${size} bytes; limit is ${SYNC_MAX_BYTES_PER_ITEM} bytes. Keep this data local or remove old entries before enabling sync.`,
  );
}

async function flushSyncWrite(key: string) {
  const pending = pendingSyncWrites.get(key);
  if (!pending) return;
  pendingSyncWrites.delete(key);
  try {
    await getBrowserApi().storage.sync.set({ [key]: pending.value });
    await updateSyncWriteStatus({ lastFlushedAt: Date.now(), lastError: "" });
    pending.resolve.forEach((resolve) => resolve());
  } catch (error) {
    await updateSyncWriteStatus({
      lastError: error instanceof Error ? error.message : String(error),
    });
    pending.reject.forEach((reject) => reject(error));
  }
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
): StorageItem<T> {
  const storageKey = key;
  const storageArea = () => getBrowserApi().storage[area];

  return {
    key: storageKey,
    area,
    async get() {
      const result = await storageArea().get(storageKey);
      if (result[storageKey] === undefined) {
        const initialValue = init();
        await setStoredValueNow(area, storageKey, initialValue);
        return initialValue;
      }
      return result[storageKey] as T;
    },
    async set(value) {
      await setStoredValue(area, storageKey, value);
    },
    async remove() {
      await storageArea().remove(storageKey);
    },
    watch(callback) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
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
      const result = await api.storage[area].get(key);
      if (result[key] !== undefined)
        return merge ? merge(result[key] as T) : (result[key] as T);

      const fallback = await api.storage[fallbackArea].get(key);
      const initialValue =
        fallback[key] === undefined ? init() : (fallback[key] as T);
      const value = merge ? merge(initialValue) : initialValue;
      await setStoredValueNow(area, key, value);
      return value;
    },
  };
}

function mergePreferences(value: Preferences): Preferences {
  return { ...DEFAULT_PREFERENCES, ...value, syncSettings: true };
}

function createSwitchableItem<T>(
  key: string,
  init: () => T,
  syncPreferenceKey: SyncPreferenceKey,
): StorageItem<T> {
  const areaFor = (preferences: Preferences): AreaName =>
    areaForSyncEnabled(preferences[syncPreferenceKey] === true);

  async function activeArea() {
    return areaFor(await storage.preferences.get());
  }

  async function getValue() {
    const area = await activeArea();
    const activeValue = await readFrom(area);
    if (activeValue !== undefined) return activeValue;

    const inactiveValue = await readFrom(otherStorageArea(area));
    const value = inactiveValue === undefined ? init() : inactiveValue;
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
    get: getValue,
    async set(value) {
      const area = await activeArea();
      await setStoredValue(area, key, value);
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
        const area = await activeArea();
        if (changes.preferences) {
          const next = await getValue();
          callback(next, next);
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
  quickAction: createSwitchableItem<QuickAction[]>(
    STORAGE_KEYS.quickAction,
    () => [],
    "syncQuickActions",
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
};

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
  const preferences = await storage.preferences.get();
  await storage.preferences.set({ ...preferences, [key]: enabled });
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
