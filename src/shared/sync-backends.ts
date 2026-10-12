import { getBrowserApi } from "./browser-api";
import { STORAGE_KEYS } from "./storage-keys";
import type {
  SyncBackendConfig,
  SyncBackendType,
  WebDavSyncBackendConfig,
} from "./types";

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

export type { WebDavSyncBackendConfig };

export function syncBackendDefaultName(id: string) {
  return (
    SYNC_BACKEND_REGISTRY.find((item) => item.id === id)?.defaultName || id
  );
}

export const DEFAULT_SYNC_BACKENDS: SyncBackendConfig[] = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.browserSync,
    name: syncBackendDefaultName(BROWSER_SYNC_BACKEND_ID),
  },
];

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

export async function getStoredSyncBackends() {
  const result = await getBrowserApi().storage.local.get(
    STORAGE_KEYS.syncBackends,
  );
  return normalizeSyncBackends(
    result[STORAGE_KEYS.syncBackends] as SyncBackendConfig[] | undefined,
  );
}

export async function getStoredActiveSyncBackendId() {
  const result = await getBrowserApi().storage.local.get(
    STORAGE_KEYS.activeSyncBackendId,
  );
  return (
    (result[STORAGE_KEYS.activeSyncBackendId] as string | undefined) ||
    NO_SYNC_BACKEND_ID
  );
}

// The active backend's configuration; undefined while sync is off.
export async function getActiveSyncBackendConfig() {
  const activeId = await getStoredActiveSyncBackendId();
  if (activeId === NO_SYNC_BACKEND_ID) return undefined;
  return (await getStoredSyncBackends()).find(
    (backend) => backend.id === activeId,
  );
}

export async function isSyncBackendEnabled() {
  return (await getStoredActiveSyncBackendId()) !== NO_SYNC_BACKEND_ID;
}

// Chats and their attachments sync over WebDAV only; browser sync storage is
// far too small for them.
export function syncBackendSupportsChats(type: SyncBackendConfig["type"]) {
  return type === SYNC_BACKEND_TYPES.webDav;
}

// What the sync state belongs to: another URL or account starts over.
export function syncBackendScope(backend: SyncBackendConfig) {
  return backend.type === SYNC_BACKEND_TYPES.webDav
    ? `${backend.type}:${backend.username || ""}@${backend.url.replace(/\/?$/, "/")}`
    : backend.type;
}
