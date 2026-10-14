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

// What a backend can hold. Engine and settings read these, never the type.
export type SyncCapabilities = {
  // Room for large content: chats, files, attachments.
  largeContent: boolean;
  // Stored blobs can be listed, so orphans can be swept.
  listsBlobs: boolean;
  // Other devices' changes are announced (storage events), so nothing polls.
  announcesChanges: boolean;
};

export type SyncBackendRegistryItem = {
  id: string;
  type: SyncBackendType;
  defaultName: string;
  capabilities: SyncCapabilities;
};

export const SYNC_BACKEND_REGISTRY = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.browserSync,
    defaultName: "Browser Sync",
    capabilities: {
      largeContent: false,
      listsBlobs: false,
      announcesChanges: true,
    },
  },
  {
    id: WEBDAV_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.webDav,
    defaultName: "WebDAV",
    capabilities: {
      largeContent: true,
      listsBlobs: true,
      announcesChanges: false,
    },
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

export function syncBackendCapabilities(
  type: SyncBackendType,
): SyncCapabilities {
  return SYNC_BACKEND_REGISTRY.find((item) => item.type === type)!.capabilities;
}

// What the sync state belongs to: another folder or account has its own.
// Spellings of one folder (http or https, host name case, default port, a
// trailing slash) are the same scope.
export function syncBackendScope(backend: SyncBackendConfig) {
  if (backend.type !== SYNC_BACKEND_TYPES.webDav) return backend.type;
  return `${backend.type}:${backend.username || ""}@${folderOf(backend.url)}`;
}

function folderOf(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/?$/, "/")}`;
  } catch {
    return url.replace(/\/?$/, "/");
  }
}
