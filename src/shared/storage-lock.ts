const operations = new Map<string, Promise<unknown>>();

// Web Locks coordinate extension pages and the background. The fallback is for
// environments without Web Locks and serializes callers in the current context.
export function withStorageLock<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lockName = `openbrowseragent:${name}`;
  if (globalThis.navigator?.locks)
    return navigator.locks.request(lockName, operation);
  const previous = operations.get(lockName) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  operations.set(lockName, next);
  const cleanup = () => {
    if (operations.get(lockName) === next) operations.delete(lockName);
  };
  next.then(cleanup, cleanup);
  return next;
}

// Held only for local reads/publication, never for backend network operations.
export const withStorageMutationLock = <T>(operation: () => Promise<T>) =>
  withStorageLock("storage-mutation", operation);

// Remote snapshots and routing transitions share one cross-context owner.
// Keep this separate from mutation/cache locks: local edits never wait for I/O.
export const withSyncOwnership = <T>(operation: () => Promise<T>) =>
  withStorageLock("sync-transition", operation);
