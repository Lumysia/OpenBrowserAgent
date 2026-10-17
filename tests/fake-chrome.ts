import { sameJson } from "../src/shared/sync/codec";
import type { StorageArea } from "../src/shared/sync/env";
import type { StorageChanges } from "../src/shared/sync/track";

// One in-memory `chrome` for unit tests: storage areas that behave like the
// real ones (key lists, defaults, change events), tabs with an active tab,
// events and ports. Tests add the other APIs they need on top.

type Listener = (...args: never[]) => unknown;

// A chrome.events.Event; `emit` calls its listeners as the browser would.
export function eventListeners<
  T extends Listener = (...args: never[]) => void,
>() {
  const listeners = new Set<T>();
  return {
    listeners,
    addListener: (listener: T) => void listeners.add(listener),
    removeListener: (listener: T) => void listeners.delete(listener),
    hasListener: (listener: T) => listeners.has(listener),
    hasListeners: () => listeners.size > 0,
    addRules: () => undefined,
    getRules: () => undefined,
    removeRules: () => undefined,
    emit: (...args: Parameters<T>) => {
      for (const listener of [...listeners]) listener(...args);
    },
  };
}

type StorageKeys = string | string[] | Record<string, unknown> | null;

export type MemoryArea = StorageArea & {
  data: Record<string, unknown>;
  // Called with each set's or remove's changes, after it resolves.
  listeners: Array<(changes: StorageChanges) => void>;
  // The keys of every set and remove call, changed or not.
  writes: string[][];
  get(keys?: StorageKeys): Promise<Record<string, unknown>>;
  clear(): Promise<void>;
};

// A storage area that reports each set or remove as one change event, after
// the call resolves (as storage.onChanged does).
export function memoryArea(): MemoryArea {
  const data: Record<string, unknown> = {};
  const listeners: Array<(changes: StorageChanges) => void> = [];
  const writes: string[][] = [];
  const emit = (changes: StorageChanges) => {
    if (!Object.keys(changes).length) return;
    const copy = structuredClone(changes);
    queueMicrotask(() => listeners.forEach((listener) => listener(copy)));
  };
  const remove = async (keys: string | string[]) => {
    const changes: StorageChanges = {};
    const list = Array.isArray(keys) ? keys : [keys];
    writes.push(list);
    for (const key of list)
      if (key in data) {
        changes[key] = { oldValue: data[key] };
        delete data[key];
      }
    emit(changes);
  };
  return {
    data,
    listeners,
    writes,
    async get(keys?: StorageKeys) {
      if (keys == null) return structuredClone(data);
      // An object gives defaults for the keys that are not stored.
      const defaults =
        typeof keys === "object" && !Array.isArray(keys) ? keys : {};
      const list =
        typeof keys === "string"
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys);
      return structuredClone(
        Object.fromEntries(
          list
            .filter((key) => key in data || key in defaults)
            .map((key) => [key, key in data ? data[key] : defaults[key]]),
        ),
      );
    },
    async set(items) {
      writes.push(Object.keys(items));
      const changes: StorageChanges = {};
      for (const [key, value] of Object.entries(structuredClone(items))) {
        if (!(key in data) || !sameJson(data[key], value))
          changes[key] = { oldValue: data[key], newValue: value };
        data[key] = value;
      }
      emit(changes);
    },
    remove,
    clear: () => remove(Object.keys(data)),
  };
}

export type FakeTab = Partial<chrome.tabs.Tab> & { id: number };

// Tabs in memory, with one active tab. `get` fails for a missing tab like
// the browser does; `update` with `active` switches the active tab.
export function fakeTabs(initial: FakeTab[] = [], active = initial[0]?.id) {
  const tabs = new Map<number, chrome.tabs.Tab>();
  const state = { active, nextId: 1, tabs };
  const full = (tab: FakeTab): chrome.tabs.Tab => ({
    index: 0,
    windowId: 1,
    pinned: false,
    highlighted: false,
    active: false,
    frozen: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    lastAccessed: 0,
    ...tab,
  });
  const add = (tab: FakeTab) => {
    tabs.set(tab.id, full(tab));
    state.nextId = Math.max(state.nextId, tab.id + 1);
  };
  initial.forEach(add);
  const view = (tab: chrome.tabs.Tab) => ({
    ...tab,
    active: tab.id === state.active,
  });
  const onUpdated =
    eventListeners<
      (
        tabId: number,
        change: chrome.tabs.OnUpdatedInfo,
        tab: chrome.tabs.Tab,
      ) => void
    >();
  const api = {
    async get(id: number) {
      const tab = tabs.get(id);
      if (!tab) throw new Error(`No tab with id: ${id}.`);
      return view(tab);
    },
    async query(info: chrome.tabs.QueryInfo = {}) {
      return [...tabs.values()]
        .map(view)
        .filter(
          (tab) =>
            (info.active === undefined || tab.active === info.active) &&
            (info.windowId === undefined || tab.windowId === info.windowId) &&
            (info.url === undefined || tab.url === info.url),
        );
    },
    async create(props: chrome.tabs.CreateProperties = {}) {
      const id = state.nextId;
      add({
        id,
        url: props.url,
        ...(props.windowId === undefined ? {} : { windowId: props.windowId }),
      });
      if (props.active !== false) state.active = id;
      return view(tabs.get(id)!);
    },
    async update(id: number, props: chrome.tabs.UpdateProperties = {}) {
      const tab = await api.get(id);
      if (props.url !== undefined) tabs.get(id)!.url = props.url;
      if (props.active) state.active = id;
      return view({ ...tab, ...tabs.get(id)! });
    },
    async remove(ids: number | number[]) {
      for (const id of [ids].flat()) tabs.delete(id);
    },
    onUpdated,
  };
  return { api, state };
}

// A runtime port; `posted` holds what the code under test sent through it.
export function fakePort(name = "fake") {
  const posted: unknown[] = [];
  const onMessage =
    eventListeners<(message: unknown, port: chrome.runtime.Port) => void>();
  const onDisconnect = eventListeners<(port: chrome.runtime.Port) => void>();
  const port: chrome.runtime.Port = {
    name,
    postMessage: (message: unknown) => void posted.push(message),
    disconnect: () => onDisconnect.emit(port),
    onMessage,
    onDisconnect,
  };
  return { port, posted, onMessage, onDisconnect };
}

// Two connected ports: a message posted on one arrives at the other's
// listeners copied and a microtask later, as between extension pages.
export function fakePortPair(name = "fake") {
  const ends = [fakePort(name), fakePort(name)] as const;
  ends.forEach((end, index) => {
    const other = ends[1 - index];
    end.port.postMessage = (message: unknown) => {
      end.posted.push(message);
      const copy = structuredClone(message);
      queueMicrotask(() => other.onMessage.emit(copy, other.port));
    };
  });
  return ends;
}

// Installs a fresh `chrome` with local, sync and session storage and the
// shared storage.onChanged event; `extra` adds or replaces APIs. Returns the
// areas and the installed object.
export function installChrome(extra: Record<string, unknown> = {}) {
  const local = memoryArea();
  const sync = memoryArea();
  const session = memoryArea();
  const onChanged =
    eventListeners<(changes: StorageChanges, areaName: string) => void>();
  for (const [areaName, area] of Object.entries({ local, sync, session }))
    area.listeners.push((changes) => onChanged.emit(changes, areaName));
  const fake = {
    storage: { local, sync, session, onChanged },
    ...extra,
  };
  Object.assign(globalThis, { chrome: fake });
  return { local, sync, session, chrome: fake };
}

// Runs with `fake` as `chrome` until the returned restore is called.
export function swapChrome(fake: Record<string, unknown>) {
  const previous = globalThis.chrome;
  Object.assign(globalThis, { chrome: fake });
  return () => Object.assign(globalThis, { chrome: previous });
}
