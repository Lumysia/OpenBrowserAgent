import { STORAGE_AREAS, type AreaName } from "./storage-areas";
import { getStoredActiveSyncBackendId } from "./sync-backends";
import {
  markSyncLocalCacheFlushed,
  readSyncLocalCache,
} from "./storage-sync-local";
import { sameStorageValue } from "./storage-value";
import type { SyncPreferenceKey } from "./storage-keys";

type ValuePolicy<T> = {
  key: string;
  activeArea(): Promise<AreaName>;
  readStoredValue<T>(area: AreaName, key: string): Promise<T | undefined>;
  init(): T;
  normalize?: (value: T) => T;
  fallbackArea?: (area: AreaName) => AreaName | undefined;
  syncPreferenceKey?: SyncPreferenceKey;
};

// Getters may publish a guarded local cache; notifications only resolve values.
// Both use the same pending-removal, fallback and normalization policy. Neither
// path reads a remote backend or creates an upload intent.
export function createStorageItemValue<T>(policy: ValuePolicy<T>) {
  const normalize = (value: T) =>
    policy.normalize ? policy.normalize(value) : value;

  async function resolve(
    value: T | undefined,
    area: AreaName,
    removed = false,
  ) {
    if (removed) return normalize(policy.init());
    if (value === undefined) {
      const fallback = policy.fallbackArea?.(area);
      if (fallback !== undefined && fallback !== area)
        value = await policy.readStoredValue<T>(fallback, policy.key);
    }
    return normalize(value === undefined ? policy.init() : value);
  }

  async function read(publish = true): Promise<T> {
    for (;;) {
      const area = await policy.activeArea();
      const backendId =
        area === STORAGE_AREAS.sync
          ? await getStoredActiveSyncBackendId()
          : undefined;
      const expected =
        area === STORAGE_AREAS.sync
          ? await readSyncLocalCache<T>(policy.key)
          : undefined;
      const pending = expected && expected.flushedAt === undefined;
      const stored =
        area === STORAGE_AREAS.sync
          ? expected?.value
          : await policy.readStoredValue<T>(area, policy.key);
      const value = await resolve(
        stored,
        area,
        !!(pending && expected.removed),
      );
      // A fallback can be asynchronous. Do not publish or notify its old value
      // after another context has staged an edit or changed the active route.
      if (area !== (await policy.activeArea())) continue;
      if (area === STORAGE_AREAS.sync) {
        if (backendId !== (await getStoredActiveSyncBackendId())) continue;
        if (publish && !pending) {
          if (
            !(await markSyncLocalCacheFlushed(policy.key, value, {
              expected,
              backendId,
              syncPreferenceKey: policy.syncPreferenceKey,
            }))
          )
            continue;
        } else if (
          !sameStorageValue(expected, await readSyncLocalCache<T>(policy.key))
        )
          continue;
      }
      return value;
    }
  }

  function watch(callback: (next: T, previous: T) => void) {
    let generation = 0;
    let disposed = false;
    return {
      // Reserve before an event handler's first await. A slow removal/fallback
      // must not overtake a newer event or notify after unsubscribe.
      begin() {
        const current = ++generation;
        return async (next?: T, previous?: T, previousRemoved = false) => {
          const value =
            next === undefined ? await read(false) : normalize(next);
          const oldValue =
            previous === undefined
              ? await resolve(
                  undefined,
                  await policy.activeArea(),
                  previousRemoved,
                )
              : normalize(previous);
          if (!disposed && current === generation) callback(value, oldValue);
        };
      },
      dispose() {
        disposed = true;
        generation++;
      },
    };
  }

  return { read, watch };
}
