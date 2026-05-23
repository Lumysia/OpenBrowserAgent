import type { SyncBackendType } from "./types";

export const BROWSER_SYNC_BACKEND_ID = "browser-sync";
export const WEBDAV_SYNC_BACKEND_ID = "webdav";
export const NO_SYNC_BACKEND_ID = "local";

export type SyncBackendRegistryItem = {
  id: string;
  type: SyncBackendType;
  defaultName: string;
};

export const SYNC_BACKEND_REGISTRY = [
  {
    id: BROWSER_SYNC_BACKEND_ID,
    type: "browser-sync",
    defaultName: "Browser Sync",
  },
  { id: WEBDAV_SYNC_BACKEND_ID, type: "webdav", defaultName: "WebDAV" },
] as const satisfies readonly SyncBackendRegistryItem[];

export function syncBackendRegistryItem(id: string) {
  return SYNC_BACKEND_REGISTRY.find((item) => item.id === id);
}
