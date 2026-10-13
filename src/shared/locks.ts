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

// Several locks at once, always taken in the same order.
export function withLocks<T>(
  lock: <R>(name: string, run: () => Promise<R>) => Promise<R>,
  names: string[],
  operation: () => Promise<T>,
) {
  const sorted = [...new Set(names)].sort();
  const step = (index: number): Promise<T> =>
    index === sorted.length
      ? operation()
      : lock(sorted[index], () => step(index + 1));
  return step(0);
}

// Lock of one stored value, shared by every writer of that key (pages, tools
// in the background and the sync engine).
export const storageLockName = (key: string) => `item:${key}`;

// The sync engine's own state: every job that reads and saves it (a round,
// storing downloaded content, clearing sync data) holds this lock, so none
// saves a state another job changed meanwhile.
export const SYNC_LOCK = "sync";

// The per-record clocks of local data: every reader that compares local data
// with them and every writer of them (recording local edits, storing remote
// changes, clearing) holds this lock, taken after any item lock.
export const CLOCK_LOCK = "sync-clocks";
