import { getBrowserApi } from "./browser-api";
import { storageLockName, withLock } from "./locks";

// A value kept for the browser session in storage.session, so a restarted
// service worker or a reopened page still has it; in memory where the browser
// has no session storage. Updates run one at a time under the key's lock,
// so concurrent ones do not lose each other's changes.
export function sessionRecord<T>(key: string, empty: () => T) {
  let memory: T | undefined;
  const listeners = new Set<(value: T) => void>();
  const area = () => getBrowserApi().storage?.session;

  async function get(): Promise<T> {
    const session = area();
    if (!session) return memory ?? empty();
    const stored = await session
      .get(key)
      .then((values) => values[key] as T | undefined)
      .catch(() => undefined);
    return stored ?? empty();
  }

  async function set(value: T) {
    const session = area();
    if (session) await session.set({ [key]: value });
    else {
      memory = value;
      for (const listener of listeners) listener(value);
    }
  }

  return {
    get,
    set: (value: T) => withLock(storageLockName(key), () => set(value)),
    // Calls `callback` with each new value, from any extension page.
    watch(callback: (value: T) => void) {
      const api = getBrowserApi().storage;
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === "session" && key in changes)
          callback((changes[key].newValue as T | undefined) ?? empty());
      };
      listeners.add(callback);
      api?.onChanged.addListener(listener);
      return () => {
        listeners.delete(callback);
        api?.onChanged.removeListener(listener);
      };
    },
    // `change` gets the current value and returns the next one.
    update(change: (value: T) => T | Promise<T>): Promise<T> {
      return withLock(storageLockName(key), async () => {
        const next = await change(await get());
        await set(next);
        return next;
      });
    },
  };
}
