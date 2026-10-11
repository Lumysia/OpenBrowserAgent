import {
  clearPendingSyncWrites,
  getBrowserApi,
  storage,
  STORAGE_KEYS,
  syncLocalCacheKey,
} from "./storage";
import { isSplitStorageKey, splitItemKey } from "./storage-split";
import { getActiveSyncBackend, isSyncBackendEnabled } from "./sync-backends";
import { syncLocalDataKey } from "./sync-tinybase-doc";

const STORAGE_KEY_GROUPS = {
  settings: [
    STORAGE_KEYS.userId,
    STORAGE_KEYS.language,
    STORAGE_KEYS.preferences,
    STORAGE_KEYS.shouldShowUpdateToast,
    STORAGE_KEYS.syncWriteStatus,
    STORAGE_KEYS.syncBackends,
    STORAGE_KEYS.activeSyncBackendId,
    STORAGE_KEYS.syncDataSettings,
  ],
  providers: [STORAGE_KEYS.provider],
  agents: [STORAGE_KEYS.agents, STORAGE_KEYS.agentWorkspaces],
  skills: [STORAGE_KEYS.skills],
  mcpServers: [STORAGE_KEYS.mcpServers],
  localExecutionBridges: [STORAGE_KEYS.localExecutionBridges],
  chats: [STORAGE_KEYS.chats, STORAGE_KEYS.chatTabs],
} as const;

export type AppStorageClearScope = "all" | "local" | "sync";
export type AppStorageClearTarget = "all" | keyof typeof STORAGE_KEY_GROUPS;

export async function clearAppStorage({
  scope = "all",
  targets = ["all"],
}: {
  scope?: AppStorageClearScope;
  targets?: AppStorageClearTarget[];
} = {}) {
  await clearPendingSyncWrites();
  const selectedTargets = targets.includes("all")
    ? (Object.keys(STORAGE_KEY_GROUPS) as Array<
        keyof typeof STORAGE_KEY_GROUPS
      >)
    : (targets as Array<keyof typeof STORAGE_KEY_GROUPS>);
  const selectedKeys = selectedTargets.flatMap(
    (target) => STORAGE_KEY_GROUPS[target],
  );
  const storedKeys = Object.keys(await getBrowserApi().storage.local.get(null));
  // Replicas and split-collection state are scoped per backend.
  const replicaKeys = storedKeys.filter((stored) =>
    (selectedKeys as string[]).includes(syncLocalDataKey(stored) ?? ""),
  );
  // Item contents of split collections are local data like their lists.
  const itemKeys = storedKeys.filter((stored) =>
    selectedKeys.some(
      (key) =>
        isSplitStorageKey(key) && stored.startsWith(splitItemKey(key, "")),
    ),
  );
  const cacheKeys = [...selectedKeys.map(syncLocalCacheKey), ...replicaKeys];
  // Capture the backend before local cleanup deletes its configuration.
  const backend =
    scope !== "local" && (await isSyncBackendEnabled())
      ? await getActiveSyncBackend()
      : undefined;
  await getBrowserApi().storage.local.remove(
    scope === "sync" ? cacheKeys : [...selectedKeys, ...itemKeys, ...cacheKeys],
  );
  if (backend) {
    // Finish every started removal before reporting failure.
    const results = await Promise.allSettled(
      selectedKeys.map(async (key) => backend.remove(key)),
    );
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
  }

  if (scope === "local" && targets.includes("all"))
    await resetLocalBootstrapState();
}

export async function resetLocalBootstrapState() {
  await storage.ignoreSyncedProvidersForBootstrap.set(true);
}

export async function completeLocalBootstrapState() {
  await storage.ignoreSyncedProvidersForBootstrap.set(false);
}
