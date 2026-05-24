import type { AreaName } from "./storage-areas";

export type StorageItem<T> = {
  key: string;
  area: AreaName;
  persistDebounceMs?: number;
  snapshot?: "hash";
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  watch(callback: (newValue: T, oldValue: T) => void): () => void;
};

export type StorageItemOptions = {
  persistDebounceMs?: number;
  snapshot?: "hash";
};
