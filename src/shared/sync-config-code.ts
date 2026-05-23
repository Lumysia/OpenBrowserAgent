import {
  BROWSER_SYNC_BACKEND_ID,
  WEBDAV_SYNC_BACKEND_ID,
} from "./sync-backend-registry";
import {
  mergeSyncDataSettings,
  type SyncDataSettings,
} from "./sync-data-settings";
import type { SyncBackendConfig } from "./types";

const SYNC_CONFIG_CODE_PREFIX = "oba-sync-v1.";

type SyncConfigCodePayload = {
  version: 1;
  backend: SyncBackendConfig;
  syncDataSettings?: SyncDataSettings;
};

export type ParsedSyncConfigCode = {
  backend: SyncBackendConfig;
  syncDataSettings: SyncDataSettings;
};

export function createSyncConfigCode({
  backend,
  syncDataSettings,
}: ParsedSyncConfigCode) {
  return `${SYNC_CONFIG_CODE_PREFIX}${base64UrlEncode(
    JSON.stringify({
      version: 1,
      backend,
      syncDataSettings,
    } satisfies SyncConfigCodePayload),
  )}`;
}

export function parseSyncConfigCode(code: string): ParsedSyncConfigCode {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SYNC_CONFIG_CODE_PREFIX))
    throw new Error("Invalid sync config code.");
  const payload = JSON.parse(
    base64UrlDecode(trimmed.slice(SYNC_CONFIG_CODE_PREFIX.length)),
  ) as Partial<SyncConfigCodePayload>;
  if (payload.version !== 1 || !payload.backend)
    throw new Error("Unsupported sync config code.");
  return {
    backend: normalizeSyncConfigCodeBackend(payload.backend),
    syncDataSettings: mergeSyncDataSettings(payload.syncDataSettings),
  };
}

function normalizeSyncConfigCodeBackend(
  backend: SyncBackendConfig,
): SyncBackendConfig {
  if (backend.type === "browser-sync") {
    return {
      id: BROWSER_SYNC_BACKEND_ID,
      type: "browser-sync",
      name: backend.name || "Browser Sync",
    };
  }
  if (backend.type === "webdav" && backend.url) {
    return {
      id: WEBDAV_SYNC_BACKEND_ID,
      type: "webdav",
      name: backend.name || "WebDAV",
      url: backend.url,
      username: backend.username || undefined,
      password: backend.password || undefined,
    };
  }
  throw new Error("Unsupported sync backend config.");
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat(
    (4 - (value.length % 4)) % 4,
  )}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}
