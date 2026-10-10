import { installBrowser } from "./helpers";

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export function eventListeners<T extends (...args: any[]) => void>() {
  const listeners = new Set<T>();
  return {
    listeners,
    addListener: (listener: T) => listeners.add(listener),
    removeListener: (listener: T) => listeners.delete(listener),
    emit: (...args: Parameters<T>) => {
      for (const listener of [...listeners]) listener(...args);
    },
  };
}
export function toolBrowser() {
  installBrowser();
  const onUpdated = eventListeners();
  const onChanged = eventListeners();
  Object.assign(chrome, {
    tabs: {
      get: async () => ({
        id: 1,
        title: "Fixture",
        url: "https://example.test",
        status: "complete",
        windowId: 1,
      }),
      query: async () => [{ id: 1 }],
      onUpdated,
    },
    scripting: { executeScript: async () => [{ result: {} }] },
    downloads: {
      download: async () => 7,
      cancel: async () => {},
      search: async () => [{ id: 7, state: "complete" }],
      onChanged,
    },
  });
  return { onUpdated, onChanged };
}
