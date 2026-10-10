import type { AreaName } from "./storage-areas";

export type StorageItemIo = {
  readStoredValue<T>(area: AreaName, key: string): Promise<T | undefined>;
  setStoredValue<T>(area: AreaName, key: string, value: T): Promise<void>;
  removeStoredValue(area: AreaName, key: string): Promise<void>;
};

export type StorageItem<T> = {
  key: string;
  area: AreaName;
  persistDebounceMs?: PersistDebounce<T>;
  snapshot?: StorageSnapshot<T>;
  reconcile?: (current: T | undefined, incoming: T) => T;
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

export type StorageItemOptions = {
  persistDebounceMs?: PersistDebounce<unknown>;
  snapshot?: StorageSnapshot<unknown>;
};

export type PersistDebounce<T> = number | ((value: T) => number | undefined);

export type StorageSnapshot<T> = "hash" | ((value: T) => string | undefined);
