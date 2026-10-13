import { storage, STORAGE_KEYS } from "./storage";
import { resetSync } from "./sync/client";

const STORAGE_KEY_GROUPS = {
  settings: [
    STORAGE_KEYS.userId,
    STORAGE_KEYS.language,
    STORAGE_KEYS.preferences,
    STORAGE_KEYS.shouldShowUpdateToast,
    STORAGE_KEYS.holidayBurstDay,
    STORAGE_KEYS.syncStatus,
    STORAGE_KEYS.syncBackends,
    STORAGE_KEYS.activeSyncBackendId,
    STORAGE_KEYS.syncDataSettings,
  ],
  providers: [STORAGE_KEYS.provider],
  agents: [STORAGE_KEYS.agents, STORAGE_KEYS.agentWorkspaces],
  skills: [STORAGE_KEYS.skills, STORAGE_KEYS.skillSettings],
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
  const selectedTargets = targets.includes("all")
    ? (Object.keys(STORAGE_KEY_GROUPS) as Array<
        keyof typeof STORAGE_KEY_GROUPS
      >)
    : (targets as Array<keyof typeof STORAGE_KEY_GROUPS>);
  const selectedKeys: string[] = selectedTargets.flatMap(
    (target) => STORAGE_KEY_GROUPS[target],
  );
  const localKeys = scope === "sync" ? [] : selectedKeys;
  // The background clears, between sync rounds and with sync off too, and
  // forgets when the cleared data changed: it is downloaded again rather
  // than deleted on other devices.
  await resetSync(scope !== "local", localKeys);

  if (scope === "local" && targets.includes("all"))
    await resetLocalBootstrapState();
}

export async function resetLocalBootstrapState() {
  await storage.ignoreSyncedProvidersForBootstrap.set(true);
}

export async function completeLocalBootstrapState() {
  await storage.ignoreSyncedProvidersForBootstrap.set(false);
}
