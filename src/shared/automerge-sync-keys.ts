const AUTOMERGE_CACHE_PREFIX = "automerge-sync-doc";

export function automergeLocalCacheKey(key: string) {
  return `${AUTOMERGE_CACHE_PREFIX}:${key}`;
}
