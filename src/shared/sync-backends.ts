import { getBrowserApi } from "./browser-api";
import { STORAGE_AREAS } from "./storage-area-constants";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  SYNC_BACKEND_TYPES,
  syncBackendDefaultName,
  WEBDAV_SYNC_BACKEND_ID,
} from "./sync-backend-registry";
import { STORAGE_KEYS } from "./storage-keys";
import type { SyncBackendConfig } from "./types";

export { BROWSER_SYNC_BACKEND_ID, NO_SYNC_BACKEND_ID, WEBDAV_SYNC_BACKEND_ID };

export type RemoteStorageChange<T = unknown> = {
  newValue?: T;
  oldValue?: T;
};

export type SyncBackend = {
  config: SyncBackendConfig;
  read<T>(key: string, cachedValue?: T): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<T | undefined>;
  remove(key: string): Promise<void>;
  test(): Promise<void>;
  watch?<T>(
    key: string,
    callback: (change: RemoteStorageChange<T>) => void,
  ): () => void;
};

export type WebDavSyncBackendConfig = Extract<
  SyncBackendConfig,
  { type: "webdav" }
>;

export const SYNC_BACKEND_RUNTIME_MESSAGE_TYPE = "sync-backend.request";

export const DEFAULT_SYNC_BACKENDS: SyncBackendConfig[] = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.browserSync,
    name: syncBackendDefaultName(BROWSER_SYNC_BACKEND_ID),
  },
];

type SyncBackendOperation =
  | "read"
  | "write"
  | "remove"
  | "test"
  | "decodeChange"
  | "webDavReadObject"
  | "webDavWriteObject"
  | "webDavRemoveObject";

type SyncBackendRuntimeRequest = {
  type: typeof SYNC_BACKEND_RUNTIME_MESSAGE_TYPE;
  backendConfig: SyncBackendConfig;
  operation: SyncBackendOperation;
  key?: string;
  objectName?: string;
  contentType?: string;
  value?: unknown;
  cachedValue?: unknown;
};

type SyncBackendRuntimeResponse<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

export type SyncBackendImpl = {
  createSyncBackend: (backendConfig: SyncBackendConfig) => SyncBackend;
  decodeSyncBackendChangeValue: <T>(
    backendConfig: SyncBackendConfig,
    key: string,
    value: unknown,
  ) => Promise<T | undefined>;
  readWebDavObject: (
    backendConfig: WebDavSyncBackendConfig,
    objectName: string,
  ) => Promise<Uint8Array | undefined>;
  writeWebDavObject: (
    backendConfig: WebDavSyncBackendConfig,
    objectName: string,
    bytes: Uint8Array,
    contentType?: string,
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
    | SyncBackendConfig[]
    | undefined;
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

export async function readWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  objectName: string,
) {
  if (isBackgroundContext()) {
    return getBackgroundSyncBackendImpl().readWebDavObject(
      backendConfig,
      objectName,
    );
  }
  const encoded = await sendSyncBackendRequest<string>({
    type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
    backendConfig,
    operation: "webDavReadObject",
    objectName,
  });
  return encoded ? base64ToBytes(encoded) : undefined;
}

export async function writeWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  objectName: string,
  bytes: Uint8Array,
  contentType: string,
) {
  if (isBackgroundContext()) {
    await getBackgroundSyncBackendImpl().writeWebDavObject(
      backendConfig,
      objectName,
      bytes,
      contentType,
    );
    return;
  }
  await sendSyncBackendRequest<void>({
    type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
    backendConfig,
    operation: "webDavWriteObject",
    objectName,
    value: bytesToBase64(bytes),
    contentType,
  });
}

export async function removeWebDavObject(
  backendConfig: WebDavSyncBackendConfig,
  objectName: string,
) {
  if (isBackgroundContext()) {
    await getBackgroundSyncBackendImpl().removeWebDavObject(
      backendConfig,
      objectName,
    );
    return;
  }
  await sendSyncBackendRequest<void>({
    type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
    backendConfig,
    operation: "webDavRemoveObject",
    objectName,
  });
}

export function handleSyncBackendRuntimeMessage(
  message: unknown,
  sendResponse: (response: SyncBackendRuntimeResponse) => void,
) {
  if (!isSyncBackendRuntimeRequest(message)) return false;
  runSyncBackendOperation(message)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}

function createRuntimeSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return {
    config: backendConfig,
    read<T>(key: string, cachedValue?: T) {
      return sendSyncBackendRequest<T>({
        type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
        backendConfig,
        operation: "read",
        key,
        cachedValue,
      });
    },
    write<T>(key: string, value: T) {
      return sendSyncBackendRequest<T>({
        type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
        backendConfig,
        operation: "write",
        key,
        value,
      });
    },
    remove(key: string) {
      return sendSyncBackendRequest<void>({
        type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
        backendConfig,
        operation: "remove",
        key,
      });
    },
    test() {
      return sendSyncBackendRequest<void>({
        type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
        backendConfig,
        operation: "test",
      });
    },
    watch<T>(key: string, callback: (change: RemoteStorageChange<T>) => void) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ) => {
        if (changedArea !== STORAGE_AREAS.sync || !changes[key]) return;
        const change = changes[key];
        Promise.all([
          sendSyncBackendRequest<T>({
            type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
            backendConfig,
            operation: "decodeChange",
            key,
            value: change.newValue,
          }),
          sendSyncBackendRequest<T>({
            type: SYNC_BACKEND_RUNTIME_MESSAGE_TYPE,
            backendConfig,
            operation: "decodeChange",
            key,
            value: change.oldValue,
          }),
        ])
          .then(([newValue, oldValue]) => callback({ newValue, oldValue }))
          .catch(() => undefined);
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
}

function createBackgroundSyncBackend(
  backendConfig: SyncBackendConfig,
): SyncBackend {
  return {
    config: backendConfig,
    async read<T>(key: string, cachedValue?: T) {
      const backend = await createSyncBackendImpl(backendConfig);
      return backend.read<T>(key, cachedValue);
    },
    async write<T>(key: string, value: T) {
      const backend = await createSyncBackendImpl(backendConfig);
      return backend.write<T>(key, value);
    },
    async remove(key: string) {
      const backend = await createSyncBackendImpl(backendConfig);
      await backend.remove(key);
    },
    async test() {
      const backend = await createSyncBackendImpl(backendConfig);
      await backend.test();
    },
  };
}

async function createSyncBackendImpl(backendConfig: SyncBackendConfig) {
  return getBackgroundSyncBackendImpl().createSyncBackend(backendConfig);
}

async function sendSyncBackendRequest<T>(request: SyncBackendRuntimeRequest) {
  const response = (await getBrowserApi().runtime.sendMessage(request)) as
    | SyncBackendRuntimeResponse<T>
    | undefined;
  if (!response) throw new Error("Sync backend did not return a response.");
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

async function runSyncBackendOperation(request: SyncBackendRuntimeRequest) {
  const backend = createBackgroundSyncBackend(request.backendConfig);
  if (request.operation === "test") return backend.test();
  if (request.operation === "webDavReadObject") {
    if (!isWebDavConfig(request.backendConfig))
      throw new Error("WebDAV backend config is required.");
    if (!request.objectName) throw new Error("WebDAV object name is required.");
    const bytes = await getBackgroundSyncBackendImpl().readWebDavObject(
      request.backendConfig,
      request.objectName,
    );
    return bytes ? bytesToBase64(bytes) : undefined;
  }
  if (request.operation === "webDavWriteObject") {
    if (!isWebDavConfig(request.backendConfig))
      throw new Error("WebDAV backend config is required.");
    if (!request.objectName || typeof request.value !== "string")
      throw new Error("WebDAV object payload is required.");
    await getBackgroundSyncBackendImpl().writeWebDavObject(
      request.backendConfig,
      request.objectName,
      base64ToBytes(request.value),
      request.contentType || "application/octet-stream",
    );
    return undefined;
  }
  if (request.operation === "webDavRemoveObject") {
    if (!isWebDavConfig(request.backendConfig))
      throw new Error("WebDAV backend config is required.");
    if (!request.objectName) throw new Error("WebDAV object name is required.");
    await getBackgroundSyncBackendImpl().removeWebDavObject(
      request.backendConfig,
      request.objectName,
    );
    return undefined;
  }
  if (!request.key) throw new Error("Sync backend request key is required.");
  if (request.operation === "decodeChange") {
    return getBackgroundSyncBackendImpl().decodeSyncBackendChangeValue(
      request.backendConfig,
      request.key,
      request.value,
    );
  }
  if (request.operation === "read")
    return backend.read(request.key, request.cachedValue);
  if (request.operation === "write")
    return backend.write(request.key, request.value);
  if (request.operation === "remove") return backend.remove(request.key);
  throw new Error(`Unknown sync backend operation: ${request.operation}`);
}

function isSyncBackendRuntimeRequest(
  message: unknown,
): message is SyncBackendRuntimeRequest {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === SYNC_BACKEND_RUNTIME_MESSAGE_TYPE
  );
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
