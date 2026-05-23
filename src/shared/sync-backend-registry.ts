import type { SyncBackendType } from "./types";

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
