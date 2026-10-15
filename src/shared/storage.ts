import { normalizeAgents } from "./agents";
import { deleteChatArtifacts } from "./artifacts";
import { getBrowserApi } from "./browser-api";
import { chatContentKey } from "./chat-keys";
import { normalizeChatSummaries } from "./chats";
import { DEFAULT_PREFERENCES, mergePreferences } from "./default-preferences";
import { normalizeLocalExecutionBridges } from "./local-execution-bridges";
import { normalizeMcpServers } from "./mcp";
import {
  forgetEditedModels,
  normalizeLearnedModelLimits,
  type LearnedModelLimits,
} from "./model-limits";
import { normalizeProviderState } from "./provider-instances";
import { normalizeSkillSettings } from "./skill-catalog";
import { normalizeSkills } from "./skills";
import {
  DEFAULT_SYNC_GROUP_SETTINGS,
  mergeSyncGroupSettings,
  STORAGE_KEYS,
  type SyncGroupSettings,
} from "./storage-keys";
import { storageLockName, withLock } from "./locks";
import { keepStoredForm } from "./stored-form";
import { sameJson } from "./sync/codec";
import { NO_SYNC_BACKEND_ID, normalizeSyncBackends } from "./sync-backends";
import { DEFAULT_SYNC_STATUS, type SyncStatus } from "./sync/state";
import { resolveLanguage } from "./ui-languages";
import { normalizeWorkspaces } from "./workspace";
import type {
  Agent,
  AgentWorkspace,
  ChatSummary,
  ChatTab,
  Preferences,
  ProviderState,
  Skill,
  SkillSettings,
  McpServerConfig,
  LocalExecutionBridgeConfig,
  SyncBackendConfig,
} from "./types";

// Every value lives in storage.local. Sync runs in the background: it notices
// changes through storage events and writes other devices' changes back
// into the same keys, under the same per-key lock as `set` and `update`.
type ItemOptions<T> = {
  normalize?: (value: T) => T;
  // Runs after a write with the previous and the stored value.
  afterSet?: (previous: T, next: T) => Promise<void>;
};

function createItem<T>(
  key: string,
  init: () => T,
  options: ItemOptions<T> = {},
) {
  const { normalize = (value: T) => value, afterSet } = options;
  const resolve = (value: T | undefined) =>
    normalize(value === undefined ? init() : value);
  const local = () => getBrowserApi().storage.local;
  const lock = <R>(run: () => Promise<R>) =>
    withLock(storageLockName(key), run);

  async function read() {
    const stored = (await local().get(key))[key] as T | undefined;
    return { stored, value: resolve(stored) };
  }

  async function get() {
    return (await read()).value;
  }

  async function write(value: T) {
    const previous = afterSet ? await get() : undefined;
    value = normalize(value);
    await local().set({ [key]: value });
    if (afterSet) await afterSet(previous as T, value);
  }

  return {
    key,
    get,
    set: (value: T) => lock(() => write(value)),
    // Read-modify-write across extension contexts: agent tools in the
    // background and the options editor both edit workspaces. Stores only
    // what the updater changed (see keepStoredForm); nothing when it changed
    // nothing.
    update(updater: (current: T) => T) {
      return lock(async () => {
        const { stored, value: current } = await read();
        const next = updater(current);
        if (next === current) return next;
        const normalized = normalize(next);
        if (sameJson(normalized, current)) return next;
        await local().set({
          [key]: keepStoredForm(stored, current, normalized),
        });
        if (afterSet) await afterSet(current, normalized);
        return next;
      });
    },
    watch(callback: (newValue: T, oldValue: T) => void) {
      let previous: T | undefined;
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area !== "local" || !changes[key]) return;
        const value = resolve(changes[key].newValue as T | undefined);
        const old = previous ?? value;
        previous = value;
        callback(value, old);
      };
      getBrowserApi().storage.onChanged.addListener(listener);
      return () => getBrowserApi().storage.onChanged.removeListener(listener);
    },
  };
}

// A synced value: a sync round may store another device's change in it at
// any time, so a whole value computed from an earlier read would undo that
// change. It is changed with `update` (by id, from what is stored then);
// `replace` is only for values meant to replace everything there.
function createSyncedItem<T>(
  key: string,
  init: () => T,
  options: ItemOptions<T> = {},
) {
  const { set, ...item } = createItem(key, init, options);
  return { ...item, replace: set };
}

type Updatable<T> = { update(updater: (current: T) => T): Promise<T> };

// Change the item `id` of a synced list, from what is stored while the
// key's lock is held. Returns the changed item; undefined when it is gone.
export async function updateById<T extends { id: string }>(
  item: Updatable<T[]>,
  id: string,
  change: (current: T) => T,
) {
  const next = await item.update((list) =>
    list.some((entry) => entry.id === id)
      ? list.map((entry) => (entry.id === id ? change(entry) : entry))
      : list,
  );
  return next.find((entry) => entry.id === id);
}

// Remove the item `id` of a synced list. Returns whether it was there.
export async function removeById<T extends { id: string }>(
  item: Updatable<T[]>,
  id: string,
) {
  let removed = false;
  await item.update((list) => {
    const next = list.filter((entry) => entry.id !== id);
    removed = next.length !== list.length;
    return removed ? next : list;
  });
  return removed;
}

async function removeContentOfRemovedChats(
  previous: ChatSummary[],
  next: ChatSummary[],
) {
  const kept = new Set(next.map((chat) => chat.id));
  const removed = previous.map((chat) => chat.id).filter((id) => !kept.has(id));
  if (!removed.length) return;
  await getBrowserApi().storage.local.remove(removed.map(chatContentKey));
  await deleteChatArtifacts(removed).catch((error) =>
    console.warn("Failed to remove chat artifacts", error),
  );
}

export type StorageItem<T> = ReturnType<typeof createItem<T>>;

export const storage = {
  language: createSyncedItem<string>(STORAGE_KEYS.language, () =>
    resolveLanguage(getBrowserApi().i18n?.getUILanguage?.()),
  ),
  preferences: createSyncedItem<Preferences>(
    STORAGE_KEYS.preferences,
    () => DEFAULT_PREFERENCES,
    { normalize: mergePreferences },
  ),
  provider: createSyncedItem<ProviderState>(STORAGE_KEYS.provider, () => ({}), {
    normalize: normalizeProviderState,
    afterSet: (_, providers) => forgetLimitsOfEditedModels(providers),
  }),
  agents: createSyncedItem<Agent[]>(
    STORAGE_KEYS.agents,
    () => normalizeAgents(undefined),
    { normalize: normalizeAgents },
  ),
  agentWorkspaces: createSyncedItem<AgentWorkspace[]>(
    STORAGE_KEYS.agentWorkspaces,
    () => [],
    { normalize: normalizeWorkspaces },
  ),
  // The user's own skills; built-ins come from the code (skill-catalog).
  skills: createSyncedItem<Skill[]>(STORAGE_KEYS.skills, () => [], {
    normalize: normalizeSkills,
  }),
  skillSettings: createSyncedItem<SkillSettings>(
    STORAGE_KEYS.skillSettings,
    () => ({}),
    { normalize: normalizeSkillSettings },
  ),
  mcpServers: createSyncedItem<McpServerConfig[]>(
    STORAGE_KEYS.mcpServers,
    () => [],
    {
      normalize: normalizeMcpServers,
    },
  ),
  localExecutionBridges: createSyncedItem<LocalExecutionBridgeConfig[]>(
    STORAGE_KEYS.localExecutionBridges,
    () => [],
    {
      normalize: normalizeLocalExecutionBridges,
    },
  ),
  shouldShowUpdateToast: createItem<boolean>(
    STORAGE_KEYS.shouldShowUpdateToast,
    () => false,
  ),
  // Chat list; each chat's content is stored apart (see chat-storage), and
  // leaves with its list entry.
  chats: createSyncedItem<ChatSummary[]>(STORAGE_KEYS.chats, () => [], {
    normalize: normalizeChatSummaries,
    afterSet: removeContentOfRemovedChats,
  }),
  chatTabs: createItem<ChatTab[]>(STORAGE_KEYS.chatTabs, () => []),
  holidayBurstDay: createItem<string>(STORAGE_KEYS.holidayBurstDay, () => ""),
  syncStatus: createItem<SyncStatus>(
    STORAGE_KEYS.syncStatus,
    () => DEFAULT_SYNC_STATUS,
    { normalize: (value) => ({ ...DEFAULT_SYNC_STATUS, ...value }) },
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
  syncGroups: createSyncedItem<SyncGroupSettings>(
    STORAGE_KEYS.syncGroups,
    () => DEFAULT_SYNC_GROUP_SETTINGS,
    { normalize: mergeSyncGroupSettings },
  ),
  ignoreSyncedProvidersForBootstrap: createItem<boolean>(
    STORAGE_KEYS.ignoreSyncedProvidersForBootstrap,
    () => false,
  ),
  debugLoggingEnabled: createItem<boolean>(
    STORAGE_KEYS.debugLoggingEnabled,
    () => false,
  ),
  learnedModelLimits: createItem<LearnedModelLimits>(
    STORAGE_KEYS.learnedModelLimits,
    () => ({}),
    { normalize: normalizeLearnedModelLimits },
  ),
};

async function forgetLimitsOfEditedModels(providers: ProviderState) {
  await storage.learnedModelLimits.update((learned) =>
    forgetEditedModels(learned, providers),
  );
}
