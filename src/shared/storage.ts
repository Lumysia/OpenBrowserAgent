import { normalizeAgents } from "./agents";
import { getBrowserApi } from "./browser-api";
import {
  chatSnapshot,
  hasUnfinishedChatRun,
  normalizeChats,
  reconcileChatSnapshots,
} from "./chats";
import { BUILTIN_SKILLS } from "./builtin-skills";
import * as config from "./config";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import { normalizeLocalExecutionBridges } from "./local-execution-bridges";
import { normalizeMcpServers } from "./mcp";
import { normalizeSkills } from "./skills";
import {
  DEFAULT_SYNC_DATA_SETTINGS,
  mergeSyncDataSettings,
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
  type SyncDataSettings,
  type SyncPreferenceKey,
} from "./storage-keys";
import {
  clearPendingSyncWrites,
  DEFAULT_SYNC_WRITE_STATUS,
  flushPendingSyncWrites,
  isSyncRouted,
  queueSyncWrite,
  readSyncedValue,
  refreshChangedSyncKey,
  syncLocalCacheKey,
  withLock,
  writePendingSyncValue,
  type SyncLocalCache,
  type SyncWriteStatus,
} from "./storage-sync";
import {
  getActiveSyncBackend,
  NO_SYNC_BACKEND_ID,
  normalizeSyncBackends,
} from "./sync-backends";
import { offloadChatInlineAttachments } from "./sync-chat-attachments";
import { normalizeWorkspaces } from "./workspace";
import type {
  Agent,
  AgentWorkspace,
  Chat,
  ChatTab,
  Preferences,
  ProviderState,
  Skill,
  McpServerConfig,
  LocalExecutionBridgeConfig,
  SyncBackendConfig,
} from "./types";

export {
  DEFAULT_SYNC_DATA_SETTINGS,
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
};
export type { SyncDataSettings, SyncPreferenceKey, SyncWriteStatus };
export { getBrowserApi };
export { clearPendingSyncWrites, flushPendingSyncWrites, syncLocalCacheKey };
export {
  restoreSyncBackendFromCloud,
  setActiveSyncBackend,
  setDataSync,
} from "./storage-sync-transitions";

type ItemOptions<T> = {
  normalize?: (value: T) => T;
  // `true` follows the active backend; a preference key also follows that
  // data category's toggle. Omitted: always local.
  sync?: SyncPreferenceKey | true;
  persistDebounceMs?: number | ((value: T) => number | undefined);
  snapshot?: (value: T) => string | undefined;
};

function createItem<T>(
  key: string,
  init: () => T,
  options: ItemOptions<T> = {},
) {
  const { normalize = (value: T) => value, sync } = options;
  const resolve = (value: T | undefined) =>
    normalize(value === undefined ? init() : value);
  const routed = async () => !!sync && (await isSyncRouted(sync));
  const local = () => getBrowserApi().storage.local;

  async function get() {
    if (await routed()) return resolve(await readSyncedValue<T>(key));
    return resolve((await local().get(key))[key] as T | undefined);
  }

  async function set(value: T) {
    value = normalize(value);
    if (!(await routed())) {
      await local().set({ [key]: value });
      return;
    }
    await writePendingSyncValue(key, value);
    // A streaming chat uploads once its run has finished.
    if (key === STORAGE_KEYS.chats && hasUnfinishedChatRun(value)) return;
    queueSyncWrite(await getActiveSyncBackend(), key);
  }

  return {
    key,
    persistDebounceMs: options.persistDebounceMs,
    snapshot: options.snapshot,
    get,
    set,
    // Read-modify-write across extension contexts: agent tools in the
    // background and the options editor both edit workspaces.
    update(updater: (current: T) => T) {
      return withLock(`item:${key}`, async () => {
        const current = await get();
        const next = updater(current);
        if (next !== current) await set(next);
        return next;
      });
    },
    watch(callback: (newValue: T, oldValue: T) => void) {
      let previous: T | undefined;
      const notify = (value: T) => {
        const old = previous ?? value;
        previous = value;
        callback(value, old);
      };
      const listener = async (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area === "sync") {
          if (sync && changes[key] && (await routed()))
            refreshChangedSyncKey(key);
          return;
        }
        if (area !== "local") return;
        const plain = changes[key];
        const cache = changes[syncLocalCacheKey(key)];
        const routeChanged =
          !!sync &&
          !!(
            changes[STORAGE_KEYS.activeSyncBackendId] ||
            (sync !== true &&
              (changes[STORAGE_KEYS.syncDataSettings] ||
                changes[syncLocalCacheKey(STORAGE_KEYS.syncDataSettings)]))
          );
        if (routeChanged) return notify(await get());
        if (!sync) {
          if (plain) notify(resolve(plain.newValue as T | undefined));
          return;
        }
        const isRouted = await routed();
        if (isRouted ? !cache : !plain) return;
        const next = isRouted
          ? (cache!.newValue as SyncLocalCache<T> | undefined)?.value
          : (plain!.newValue as T | undefined);
        notify(next === undefined ? await get() : normalize(next));
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
}

export type StorageItem<T> = ReturnType<typeof createItem<T>>;

function createChatsItem() {
  const item = createItem<Chat[]>(STORAGE_KEYS.chats, () => [], {
    sync: SYNC_PREFERENCES.chats,
    normalize: normalizeChats,
    persistDebounceMs: (value) =>
      hasUnfinishedChatRun(value)
        ? config.CHAT_STREAM_WRITE_DEBOUNCE_MS
        : config.CHAT_WRITE_DEBOUNCE_MS,
    snapshot: chatSnapshot,
  });
  return {
    ...item,
    reconcile: reconcileChatSnapshots,
    async set(value: Chat[]) {
      await item.set(await offloadChatInlineAttachments(value));
    },
  };
}

export const storage = {
  language: createItem<string>(
    STORAGE_KEYS.language,
    () => getBrowserApi().i18n?.getUILanguage?.() || "en-US",
    { sync: true },
  ),
  preferences: createItem<Preferences>(
    STORAGE_KEYS.preferences,
    () => DEFAULT_PREFERENCES,
    { sync: true, normalize: mergePreferences },
  ),
  provider: createItem<ProviderState>(STORAGE_KEYS.provider, () => ({}), {
    sync: SYNC_PREFERENCES.providers,
  }),
  agents: createItem<Agent[]>(
    STORAGE_KEYS.agents,
    () => normalizeAgents(undefined),
    { sync: SYNC_PREFERENCES.agents, normalize: normalizeAgents },
  ),
  agentWorkspaces: createItem<AgentWorkspace[]>(
    STORAGE_KEYS.agentWorkspaces,
    () => [],
    { sync: SYNC_PREFERENCES.agents, normalize: normalizeWorkspaces },
  ),
  skills: createItem<Skill[]>(STORAGE_KEYS.skills, () => BUILTIN_SKILLS, {
    sync: SYNC_PREFERENCES.skills,
    normalize: normalizeSkills,
  }),
  mcpServers: createItem<McpServerConfig[]>(STORAGE_KEYS.mcpServers, () => [], {
    sync: SYNC_PREFERENCES.mcpServers,
    normalize: normalizeMcpServers,
  }),
  localExecutionBridges: createItem<LocalExecutionBridgeConfig[]>(
    STORAGE_KEYS.localExecutionBridges,
    () => [],
    {
      sync: SYNC_PREFERENCES.localExecutionBridges,
      normalize: normalizeLocalExecutionBridges,
    },
  ),
  shouldShowUpdateToast: createItem<boolean>(
    STORAGE_KEYS.shouldShowUpdateToast,
    () => false,
  ),
  chats: createChatsItem(),
  chatTabs: createItem<ChatTab[]>(STORAGE_KEYS.chatTabs, () => []),
  syncWriteStatus: createItem<SyncWriteStatus>(
    STORAGE_KEYS.syncWriteStatus,
    () => DEFAULT_SYNC_WRITE_STATUS,
  ),
  syncBackends: createItem<SyncBackendConfig[]>(
    STORAGE_KEYS.syncBackends,
    () => normalizeSyncBackends(undefined),
    { normalize: normalizeSyncBackends },
  ),
  activeSyncBackendId: createItem<string>(
    STORAGE_KEYS.activeSyncBackendId,
    () => NO_SYNC_BACKEND_ID,
  ),
  syncDataSettings: createItem<SyncDataSettings>(
    STORAGE_KEYS.syncDataSettings,
    () => DEFAULT_SYNC_DATA_SETTINGS,
    { sync: true, normalize: mergeSyncDataSettings },
  ),
  ignoreSyncedProvidersForBootstrap: createItem<boolean>(
    STORAGE_KEYS.ignoreSyncedProvidersForBootstrap,
    () => false,
  ),
  debugLoggingEnabled: createItem<boolean>(
    STORAGE_KEYS.debugLoggingEnabled,
    () => false,
  ),
};
