import type { Messages } from "../shared/i18n";
import {
  SYNC_BACKEND_TYPES,
  syncBackendDefaultName,
} from "../shared/sync-backends";
import type { SyncBackendConfig, SyncBackendType } from "../shared/types";

// What kind of sync a backend type is, in the UI language.
export function syncBackendTypeLabel(type: SyncBackendType, t: Messages) {
  return type === SYNC_BACKEND_TYPES.browserSync
    ? t.options.syncBackendBrowserSync
    : t.options.syncBackendWebDavSync;
}

// A backend's title: the name the user gave it, else its type.
export function syncBackendTitle(backend: SyncBackendConfig, t: Messages) {
  const named =
    backend.type === SYNC_BACKEND_TYPES.webDav &&
    backend.name &&
    backend.name !== syncBackendDefaultName(backend.id);
  return named ? backend.name : syncBackendTypeLabel(backend.type, t);
}

export function syncBackendHint(type: SyncBackendType, t: Messages) {
  return type === SYNC_BACKEND_TYPES.browserSync
    ? t.options.syncBackendBrowserSyncHint
    : t.options.syncBackendWebDavSyncHint;
}
