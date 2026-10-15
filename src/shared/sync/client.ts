import { sendRuntimeRequest } from "../runtime-messages";
import type { SyncBackendConfig } from "../types";
import type { SyncStatus } from "./state";
import type { ServerCheck } from "./transport";

// Extension pages (and background code) reach the sync service through these
// calls. Pages never run sync themselves: they only report whether they are
// visible and ask for work, so all pages share one schedule.

export const SYNC_MESSAGE = {
  page: "sync.page-state",
  now: "sync.now",
  load: "sync.load-content",
  resolveDeletes: "sync.resolve-deletes",
  check: "sync.check",
  reset: "sync.reset",
  passphrase: "sync.passphrase",
} as const;

export type SyncRequest =
  | { type: typeof SYNC_MESSAGE.page; visible: boolean; focused: boolean }
  | { type: typeof SYNC_MESSAGE.now }
  | { type: typeof SYNC_MESSAGE.load; collection: string; id: string }
  | {
      type: typeof SYNC_MESSAGE.resolveDeletes;
      apply: boolean;
      // Answers the prompt about deletions made on this device.
      local?: boolean;
    }
  | { type: typeof SYNC_MESSAGE.check; backend: SyncBackendConfig }
  | {
      type: typeof SYNC_MESSAGE.reset;
      // Delete everything on the server.
      remote: boolean;
      // Local keys to remove. What was synced for them is forgotten too, so
      // the cleared data is downloaded again instead of deleted everywhere.
      keys: string[];
    }
  // Sets the sync passphrase (new, changed, or the one another device set)
  // and turns key sync on.
  | { type: typeof SYNC_MESSAGE.passphrase; passphrase: string };

// What setting the passphrase did: "wrong" when the server has a passphrase
// and this was not it.
export type PassphraseResult = "set" | "wrong";

type Handler = (request: SyncRequest) => Promise<unknown>;

let localHandler: Handler | undefined;

// The background registers the service, so its own callers skip messaging.
export function registerSyncHandler(handler: Handler) {
  localHandler = handler;
}

const SYNC_MESSAGE_TYPES = new Set<string>(Object.values(SYNC_MESSAGE));

export function isSyncRequest(message: unknown): message is SyncRequest {
  return (
    !!message &&
    typeof message === "object" &&
    SYNC_MESSAGE_TYPES.has(String((message as { type?: unknown }).type))
  );
}

async function send<T>(request: SyncRequest) {
  if (localHandler) return (await localHandler(request)) as T;
  return sendRuntimeRequest<T>(request, "Sync service");
}

export const syncNow = () => send<SyncStatus>({ type: SYNC_MESSAGE.now });

// Download content this device has not held yet (a chat opened for the first
// time here). Resolves whether it is now stored locally.
export const loadSyncedContent = (collection: string, id: string) =>
  send<boolean>({ type: SYNC_MESSAGE.load, collection, id });

export const resolveMassDelete = (apply: boolean, local = false) =>
  send<SyncStatus>({ type: SYNC_MESSAGE.resolveDeletes, apply, local });

export const checkSyncBackend = (backend: SyncBackendConfig) =>
  send<ServerCheck>({ type: SYNC_MESSAGE.check, backend });

export const resetSync = (remote: boolean, keys: string[]) =>
  // Runs in the background, between sync rounds.
  send<void>({ type: SYNC_MESSAGE.reset, remote, keys });

export const setSyncPassphrase = (passphrase: string) =>
  send<PassphraseResult>({ type: SYNC_MESSAGE.passphrase, passphrase });

export function reportPageState(visible: boolean, focused: boolean) {
  return send<void>({ type: SYNC_MESSAGE.page, visible, focused });
}
