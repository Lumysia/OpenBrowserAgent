const TINYBASE_SYNC_CACHE_PREFIX = "tinybase-sync-doc";

export function tinybaseSyncLocalCacheKey(key: string) {
  return `${TINYBASE_SYNC_CACHE_PREFIX}:${key}`;
}
