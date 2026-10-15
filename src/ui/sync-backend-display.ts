import type { Messages } from "../shared/i18n";
import { SYNC_BACKEND_TYPES } from "../shared/sync-backends";
import type { SyncBackendType } from "../shared/types";

// What kind of sync a backend type is, in the UI language.
export function syncBackendTypeLabel(type: SyncBackendType, t: Messages) {
  return type === SYNC_BACKEND_TYPES.browserSync
    ? t.options.syncBackendBrowserSync
    : t.options.syncBackendWebDavSync;
}

export function syncBackendHint(type: SyncBackendType, t: Messages) {
  return type === SYNC_BACKEND_TYPES.browserSync
    ? t.options.syncBackendBrowserSyncHint
    : t.options.syncBackendWebDavSyncHint;
}
