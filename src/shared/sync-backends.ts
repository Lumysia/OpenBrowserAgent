import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS } from "./storage-keys";
import type { SyncBackendConfig, SyncBackendType } from "./types";
import { bytesToBase64, base64ToBytes } from "./binary";
export const SYNC_BACKEND_TYPES = {
  browserSync: "browser-sync",
  webDav: "webdav",
} as const satisfies Record<string, SyncBackendType>;

export const BROWSER_SYNC_BACKEND_ID = SYNC_BACKEND_TYPES.browserSync;
export const WEBDAV_SYNC_BACKEND_ID = SYNC_BACKEND_TYPES.webDav;
export const NO_SYNC_BACKEND_ID = "local";

export type SyncBackendRegistryItem = {
  id: string;
  type: SyncBackendType;
  defaultName: string;
};

export const SYNC_BACKEND_REGISTRY = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.browserSync,
    defaultName: "Browser Sync",
  },
  {
    id: WEBDAV_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.webDav,
    defaultName: "WebDAV",
  },
] as const satisfies readonly SyncBackendRegistryItem[];

export function syncBackendRegistryItem(id: string) {
  return SYNC_BACKEND_REGISTRY.find((item) => item.id === id);
}

export function syncBackendDefaultName(id: string) {
  return syncBackendRegistryItem(id)?.defaultName || id;
}

export const SYNC_BACKEND_RUNTIME_MESSAGE_TYPE = "sync-backend.request";
export const SYNC_BACKEND_RUNTIME_PORT_NAME = "sync-backend.operation";

export type SyncBackendRuntimeRequest = {
  type: typeof SYNC_BACKEND_RUNTIME_MESSAGE_TYPE;
  backendConfig: SyncBackendConfig;
  operation:
    | "read"
    | "write"
    | "writeItems"
    | "readItem"
    | "remove"
    | "test"
    | "webDavReadObject"
    | "webDavWriteObject"
    | "webDavRemoveObject";
  key?: string;
  itemId?: string;
  have?: boolean;
  objectName?: string;
  contentType?: string;
  value?: unknown;
  contents?: Record<string, unknown>;
};

export type SyncBackendRuntimeResponse<T = unknown> =
  { ok: true; value?: T } | { ok: false; error: string };

async function sendSyncBackendRequest<T>(
  request: SyncBackendRuntimeRequest,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const response = signal
    ? await requestWithSignal<T>(request, signal)
    : ((await getBrowserApi().runtime.sendMessage(request)) as
        SyncBackendRuntimeResponse<T> | undefined);
  if (!response) throw new Error("Sync backend did not return a response.");
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

// One operation per port makes cancellation ownership explicit. Closing a page
// or aborting its caller closes the port and aborts the background fetch too.
function requestWithSignal<T>(
  request: SyncBackendRuntimeRequest,
  signal: AbortSignal,
) {
  return new Promise<SyncBackendRuntimeResponse<T>>((resolve, reject) => {
    const runtime = getBrowserApi().runtime;
    const port = runtime.connect({ name: SYNC_BACKEND_RUNTIME_PORT_NAME });
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      port.onMessage.removeListener(receive);
      port.onDisconnect.removeListener(disconnect);
      port.disconnect();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const receive = (response: SyncBackendRuntimeResponse<T>) => {
      cleanup();
      resolve(response);
    };
    const disconnect = () => {
      const error = runtime.lastError;
      cleanup();
      reject(
        new Error(
          error?.message || "Sync backend disconnected before responding.",
        ),
      );
    };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnect);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      port.postMessage(request);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

// Neither `value` nor `unchanged`: the content is not available.
export type SyncItemRead = { value?: unknown; unchanged?: boolean };

export type SyncBackend = {
  config: SyncBackendConfig;
  // Split collections (storage-split) read and write their list only;
  // contents go through writeItems (list plus given contents, returns both
  // merged) and readItem (fetched only when newer than this copy, `have`).
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<T | undefined>;
  writeItems<T>(
    key: string,
    value: T,
    contents: Record<string, unknown>,
  ): Promise<{ value?: T; contents: Record<string, unknown> }>;
  readItem(key: string, id: string, have: boolean): Promise<SyncItemRead>;
  remove(key: string): Promise<void>;
  test(): Promise<void>;
};

export type WebDavSyncBackendConfig = Extract<
  SyncBackendConfig,
  { type: "webdav" }
>;

export const DEFAULT_SYNC_BACKENDS: SyncBackendConfig[] = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.browserSync,
    name: syncBackendDefaultName(BROWSER_SYNC_BACKEND_ID),
  },
];

export type SyncBackendImpl = {
  createSyncBackend: (backendConfig: SyncBackendConfig) => SyncBackend;
  readWebDavObject: (
    backendConfig: WebDavSyncBackendConfig,
    objectName: string,
    signal?: AbortSignal,
  ) => Promise<Uint8Array | undefined>;
  writeWebDavObject: (
    backendConfig: WebDavSyncBackendConfig,
    objectName: string,
    bytes: Uint8Array,
    contentType?: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  removeWebDavObject: (
    backendConfig: WebDavSyncBackendConfig,
    objectName: string,
  ) => Promise<void>;
};

let backgroundSyncBackendImpl: SyncBackendImpl | undefined;

export function registerSyncBackendImpl(impl: SyncBackendImpl) {
  backgroundSyncBackendImpl = impl;
}

export async function getActiveSyncBackend() {
  const backends = await getStoredSyncBackends();
  const activeId = await getStoredActiveSyncBackendId();
  if (activeId === NO_SYNC_BACKEND_ID)
    throw new Error("Sync backend is disabled.");
  const backendConfig = backends.find((backend) => backend.id === activeId);
  if (!backendConfig) throw new Error(`Unknown sync backend: ${activeId}`);
  return createSyncBackend(backendConfig);
}

export async function isSyncBackendEnabled() {
  return (await getStoredActiveSyncBackendId()) !== NO_SYNC_BACKEND_ID;
}

export async function getStoredSyncBackends() {
  const api = getBrowserApi();
  const result = await api.storage.local.get(STORAGE_KEYS.syncBackends);
  const backends = result[STORAGE_KEYS.syncBackends] as
    SyncBackendConfig[] | undefined;
  return normalizeSyncBackends(backends);
}

export async function getStoredActiveSyncBackendId() {
  const api = getBrowserApi();
  const result = await api.storage.local.get(STORAGE_KEYS.activeSyncBackendId);
  return (
    (result[STORAGE_KEYS.activeSyncBackendId] as string | undefined) ||
    NO_SYNC_BACKEND_ID
  );
}

export function normalizeSyncBackends(value: SyncBackendConfig[] | undefined) {
  const byId = new Map<string, SyncBackendConfig>();
  for (const backend of DEFAULT_SYNC_BACKENDS) byId.set(backend.id, backend);
  for (const backend of value || []) {
    if (!backend?.id || !backend?.type || !backend?.name) continue;
    if (backend.type === SYNC_BACKEND_TYPES.webDav && !backend.url) continue;
    byId.set(backend.id, backend);
  }
  return Array.from(byId.values());
}

export function createSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  if (isBackgroundContext()) return createBackgroundSyncBackend(backendConfig);
  return createRuntimeSyncBackend(backendConfig);
}

export function syncBackendSupportsChatAttachments(
  backendType: SyncBackendConfig["type"],
) {
  return backendType === SYNC_BACKEND_TYPES.webDav;
}

function webDavConfig(backend: SyncBackend) {
  if (isWebDavConfig(backend.config)) return backend.config;
  throw new Error(
    `Sync backend does not support attachment objects: ${backend.config.type}`,
  );
}

export async function readSyncBackendObject(
  backend: SyncBackend,
  objectName: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const backendConfig = webDavConfig(backend);
  if (isBackgroundContext())
    return getBackgroundSyncBackendImpl().readWebDavObject(
      backendConfig,
      objectName,
      signal,
    );
  const encoded = await sendSyncBackendRequest<string>(
    {
      type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
      backendConfig,
      operation: "webDavReadObject",
      objectName,
    },
    signal,
  );
  return encoded ? base64ToBytes(encoded) : undefined;
}

export async function writeSyncBackendObject(
  backend: SyncBackend,
  objectName: string,
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const backendConfig = webDavConfig(backend);
  if (isBackgroundContext())
    return getBackgroundSyncBackendImpl().writeWebDavObject(
      backendConfig,
      objectName,
      bytes,
      contentType,
      signal,
    );
  await sendSyncBackendRequest<void>(
    {
      type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
      backendConfig,
      operation: "webDavWriteObject",
      objectName,
      value: bytesToBase64(bytes),
      contentType,
    },
    signal,
  );
}

export async function removeSyncBackendObject(
  backend: SyncBackend,
  objectName: string,
) {
  const backendConfig = webDavConfig(backend);
  if (isBackgroundContext())
    return getBackgroundSyncBackendImpl().removeWebDavObject(
      backendConfig,
      objectName,
    );
  await sendSyncBackendRequest<void>({
    type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
    backendConfig,
    operation: "webDavRemoveObject",
    objectName,
  });
}

function createRuntimeSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  const send = <T>(
    operation: SyncBackendRuntimeRequest["operation"],
    key?: string,
    value?: unknown,
    extra: Partial<SyncBackendRuntimeRequest> = {},
  ) =>
    sendSyncBackendRequest<T>({
      type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
      backendConfig,
      operation,
      key,
      value,
      ...extra,
    });
  return {
    config: backendConfig,
    read: (key) => send("read", key),
    write: (key, value) => send("write", key, value),
    writeItems: async (key, value, contents) =>
      (await send("writeItems", key, value, { contents }))!,
    readItem: async (key, itemId, have) =>
      (await send<SyncItemRead>("readItem", key, undefined, {
        itemId,
        have,
      }))!,
    remove: (key) => send<void>("remove", key).then(() => undefined),
    test: () => send<void>("test").then(() => undefined),
  };
}

// The implementation registers itself when the background imports it.
function createBackgroundSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  const impl = () =>
    getBackgroundSyncBackendImpl().createSyncBackend(backendConfig);
  return {
    config: backendConfig,
    read: (key) => impl().read(key),
    write: (key, value) => impl().write(key, value),
    writeItems: (key, value, contents) =>
      impl().writeItems(key, value, contents),
    readItem: (key, id, have) => impl().readItem(key, id, have),
    remove: (key) => impl().remove(key),
    test: () => impl().test(),
  };
}

function isBackgroundContext() {
  return typeof document === "undefined";
}

function getBackgroundSyncBackendImpl() {
  if (!backgroundSyncBackendImpl)
    throw new Error("Sync backend implementation is not registered.");
  return backgroundSyncBackendImpl;
}

function isWebDavConfig(
  backendConfig: SyncBackendConfig,
): backendConfig is WebDavSyncBackendConfig {
  return backendConfig.type === SYNC_BACKEND_TYPES.webDav;
}
