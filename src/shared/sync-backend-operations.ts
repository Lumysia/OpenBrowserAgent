import { SYNC_BACKEND_TYPES } from "./sync-backend-registry";
import type { SyncBackend } from "./sync-backends";
import type { SyncBackendConfig } from "./types";

const operations = new Map<string, Promise<unknown>>();

export function syncBackendCacheKey(
  backendConfig: SyncBackendConfig,
  key: string,
) {
  const scope =
    backendConfig.type === SYNC_BACKEND_TYPES.webDav
      ? `${backendConfig.type}:${backendConfig.username || ""}:${backendConfig.url}`
      : backendConfig.id;
  return `${scope}:${key}`;
}

// All extension contexts reach these adapters through the background. Serialize
// read/modify/write per document, including across freshly-created adapters.
export function serializeSyncBackend(backend: SyncBackend): SyncBackend {
  function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const scope = syncBackendCacheKey(backend.config, key);
    const previous = operations.get(scope) || Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    operations.set(scope, next);
    const cleanup = () => {
      if (operations.get(scope) === next) operations.delete(scope);
    };
    next.then(cleanup, cleanup);
    return next;
  }
  return {
    ...backend,
    read: <T>(key: string, cachedValue?: T) =>
      run(key, () => backend.read(key, cachedValue)),
    write: <T>(key: string, value: T) =>
      run(key, () => backend.write(key, value)),
    remove: (key) => run(key, () => backend.remove(key)),
  };
}
