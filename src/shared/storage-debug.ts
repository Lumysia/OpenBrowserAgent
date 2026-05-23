import {
  automergeLocalCacheKey,
  removeLocalAutomergeDocument,
} from "./automerge-sync-doc";
import {
  clearPendingSyncWrites,
  getBrowserApi,
  storage,
  STORAGE_KEYS,
  syncLocalCacheKey,
} from "./storage";
import { getActiveSyncBackend, isSyncBackendEnabled } from "./sync-backends";

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
  clearPendingSyncWrites();
  const selectedTargets = targets.includes("all")
    ? (Object.keys(STORAGE_KEY_GROUPS) as Array<
        keyof typeof STORAGE_KEY_GROUPS
      >)
    : (targets as Array<keyof typeof STORAGE_KEY_GROUPS>);
  const selectedKeys = selectedTargets.flatMap(
    (target) => STORAGE_KEY_GROUPS[target],
  );
  const localKeys = [
    ...selectedKeys,
    ...selectedKeys.map((key) => syncLocalCacheKey(key)),
    ...selectedKeys.map((key) => automergeLocalCacheKey(key)),
  ];
  const tasks: Array<Promise<void>> = [];
  if (scope === "all" || scope === "local")
    tasks.push(getBrowserApi().storage.local.remove(localKeys));
  if (scope === "all" || scope === "sync") {
    if (await isSyncBackendEnabled()) {
      const backend = await getActiveSyncBackend();
      tasks.push(
        Promise.all(selectedKeys.map((key) => backend.remove(key))).then(
          () => undefined,
        ),
      );
    }
    tasks.push(
      getBrowserApi().storage.local.remove(
        selectedKeys.flatMap((key) => [
          syncLocalCacheKey(key),
          automergeLocalCacheKey(key),
        ]),
      ),
    );
  }
  if (scope === "all")
    tasks.push(
      Promise.all(
        selectedKeys.map((key) => removeLocalAutomergeDocument(key)),
      ).then(() => undefined),
    );
  await Promise.all(tasks);

  if (scope === "local" && targets.includes("all"))
    await resetLocalBootstrapState();
}

export async function resetLocalBootstrapState() {
  await storage.ignoreSyncedProvidersForBootstrap.set(true);
}

export async function completeLocalBootstrapState() {
  await storage.ignoreSyncedProvidersForBootstrap.set(false);
}
