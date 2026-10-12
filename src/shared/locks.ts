const lockQueues = new Map<string, Promise<unknown>>();

// Web Locks serialize the extension pages and the background; the fallback
// serializes callers within one context.
export function withLock<T>(name: string, operation: () => Promise<T>) {
  const lockName = `openbrowseragent:${name}`;
  if (globalThis.navigator?.locks)
    return navigator.locks.request(lockName, operation) as Promise<T>;
  const next = (lockQueues.get(lockName) || Promise.resolve())
    .catch(() => undefined)
    .then(operation);
  lockQueues.set(lockName, next);
  return next;
}

// Lock of one stored value, shared by every writer of that key (pages, tools
// in the background and the sync engine).
export const storageLockName = (key: string) => `item:${key}`;
