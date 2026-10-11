import { useState, type ReactNode } from "react";
import {
  Activity,
  Bot,
  Cloud,
  Database,
  FileText,
  MessagesSquare,
  Paperclip,
  Plug,
  TerminalSquare,
} from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import {
  setActiveSyncBackend,
  setDataSync,
  flushPendingSyncWrites,
  storage,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
  type SyncPreferenceKey,
  type SyncDataSettings,
} from "../../src/shared/storage";
import type { SyncBackendConfig } from "../../src/shared/types";
import { SYNC_DATA_SETTING_KEYS } from "../../src/shared/storage-keys";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { SyncBackendCard, type SyncDataToggle } from "./sync-backend-card";

export function SyncPage() {
  const [language] = useStoredState(storage.language);
  const [syncDataSettings] = useStoredState(storage.syncDataSettings);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId] = useStoredState(storage.activeSyncBackendId);
  const [pendingActiveBackendId, setPendingActiveBackendId] =
    useState<string>();
  // Shows the requested value until the sync transition finishes; the toggle
  // stays disabled meanwhile so requests cannot overlap.
  const [pendingSyncSettings, setPendingSyncSettings] = useState<
    Partial<Record<keyof SyncDataSettings, boolean>>
  >({});
  const [syncWriteStatus] = useStoredState(storage.syncWriteStatus);
  const t = getMessages(language);

  if (!syncDataSettings || !syncBackends || !activeSyncBackendId) return null;
  const syncToggleContent: Record<
    SyncPreferenceKey,
    { title: string; description: string; icon: ReactNode }
  > = {
    [SYNC_PREFERENCES.providers]: {
      title: t.options.syncProviders,
      description: t.options.syncProvidersDescription,
      icon: <Database size={18} />,
    },
    [SYNC_PREFERENCES.skills]: {
      title: t.options.syncSkills,
      description: t.options.syncSkillsDescription,
      icon: <FileText size={18} />,
    },
    [SYNC_PREFERENCES.mcpServers]: {
      title: t.options.syncMcpServers,
      description: t.options.syncMcpServersDescription,
      icon: <Plug size={18} />,
    },
    [SYNC_PREFERENCES.localExecutionBridges]: {
      title: t.options.syncLocalExecutionBridges,
      description: t.options.syncLocalExecutionBridgesDescription,
      icon: <TerminalSquare size={18} />,
    },
    [SYNC_PREFERENCES.agents]: {
      title: t.options.syncAgents,
      description: t.options.syncAgentsDescription,
      icon: <Bot size={18} />,
    },
    [SYNC_PREFERENCES.chats]: {
      title: t.options.syncChats,
      description: t.options.syncChatsDescription,
      icon: <MessagesSquare size={18} />,
    },
  };

  function updateSyncPreference(key: keyof SyncDataSettings, value: boolean) {
    setPendingSyncSettings((previous) => ({ ...previous, [key]: value }));
    setDataSync(key, value)
      .catch((error) => {
        console.warn("Failed to update sync preference", error);
      })
      .finally(() =>
        setPendingSyncSettings(({ [key]: _done, ...rest }) => rest),
      );
  }

  function changeActiveBackend(backendId: string) {
    setPendingActiveBackendId(backendId);
    setActiveSyncBackend(backendId)
      .catch((error) => {
        console.warn("Failed to change sync backend", error);
      })
      .finally(() => {
        setPendingActiveBackendId((pending) =>
          pending === backendId ? undefined : pending,
        );
      });
  }

  async function updateBackends(nextBackends: SyncBackendConfig[]) {
    await flushPendingSyncWrites().catch((error) =>
      console.warn("Failed to flush pending sync writes", error),
    );
    setSyncBackends(nextBackends);
  }

  const dataToggles: SyncDataToggle[] = [
    ...SYNC_PREFERENCE_KEYS.map((preferenceKey) => ({
      key: preferenceKey,
      title: syncToggleContent[preferenceKey].title,
      description: syncToggleContent[preferenceKey].description,
      icon: syncToggleContent[preferenceKey].icon,
      value:
        pendingSyncSettings[preferenceKey] ??
        syncDataSettings[preferenceKey] === true,
      pending: pendingSyncSettings[preferenceKey] !== undefined,
      onChange: (value: boolean) => updateSyncPreference(preferenceKey, value),
    })),
    {
      key: SYNC_DATA_SETTING_KEYS.chatAttachments,
      title: t.options.syncChatAttachments,
      description: t.options.syncChatAttachmentsDescription,
      icon: <Paperclip size={18} />,
      value:
        pendingSyncSettings[SYNC_DATA_SETTING_KEYS.chatAttachments] ??
        syncDataSettings[SYNC_DATA_SETTING_KEYS.chatAttachments] === true,
      pending:
        pendingSyncSettings[SYNC_DATA_SETTING_KEYS.chatAttachments] !==
        undefined,
      attachmentBackendOnly: true,
      onChange: (value: boolean) =>
        updateSyncPreference(SYNC_DATA_SETTING_KEYS.chatAttachments, value),
    },
  ];

  const visibleActiveBackendId = pendingActiveBackendId || activeSyncBackendId;

  return (
    <div className="stack">
      <div>
        <h1 className="settings-page-title">
          <Cloud size={24} /> {t.options.sync}
        </h1>
        <p className="muted">{t.options.syncSettingsDescription}</p>
      </div>
      <SyncBackendCard
        activeBackendId={visibleActiveBackendId}
        backends={syncBackends}
        dataToggles={dataToggles}
        syncDataSettings={syncDataSettings}
        onActiveBackendChange={changeActiveBackend}
        onBackendsChange={updateBackends}
        t={t}
      />
      <SyncWriteStatusCard status={syncWriteStatus} />
    </div>
  );
}

function SyncWriteStatusCard({
  status,
}: {
  status: Awaited<ReturnType<typeof storage.syncWriteStatus.get>> | undefined;
}) {
  const [language] = useStoredState(storage.language);
  const t = getMessages(language);
  const pendingCount = status?.pendingCount || 0;
  const activeCount = status?.activeCount || 0;
  const hasError = !!status?.lastError;
  const title = hasError
    ? t.options.syncWriteError
    : activeCount > 0
      ? t.options.syncWriteSyncing
      : pendingCount > 0
        ? t.options.syncWritePending
        : t.options.syncWriteIdle;
  const detail = hasError
    ? status?.lastError
    : pendingCount > 0
      ? t.options.syncWritePendingDetail.replace(
          "{count}",
          String(pendingCount),
        )
      : status?.lastFlushedAt
        ? new Date(status.lastFlushedAt).toLocaleTimeString()
        : "";
  const pendingItems = status?.pendingItems || [];
  const keyLabels = syncStorageKeyLabels(t);

  return (
    <Card>
      <CardContent>
        <div className="sync-status-row">
          <span
            className={`sync-status-dot ${hasError ? "error" : activeCount > 0 || pendingCount > 0 ? "pending" : ""}`}
          />
          <div>
            <CardTitle className="settings-section-title">
              <Activity size={18} /> {title}
            </CardTitle>
            {detail && <CardDescription>{detail}</CardDescription>}
            {pendingItems.length > 0 && (
              <div className="sync-status-items">
                {pendingItems.map((item) => (
                  <CardDescription
                    key={`${item.operation}:${item.key}:${item.backendName}`}
                    className="sync-status-item"
                  >
                    <span>{keyLabels[item.key] || item.key}</span>
                    <span>
                      {item.operation === "remove"
                        ? t.options.syncWriteOperationRemove
                        : t.options.syncWriteOperationWrite}
                      {" -> "}
                      {item.backendName}
                    </span>
                  </CardDescription>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function syncStorageKeyLabels(t: ReturnType<typeof getMessages>) {
  return {
    [storage.language.key]: t.common.language,
    [storage.preferences.key]: t.options.general,
    [storage.provider.key]: t.options.providers,
    [storage.syncDataSettings.key]: t.options.sync,
    [storage.agents.key]: t.options.agents,
    [storage.agentWorkspaces.key]: t.options.syncAgents,
    [storage.skills.key]: t.options.skills,
    [storage.mcpServers.key]: t.options.mcpServers,
    [storage.localExecutionBridges.key]: t.options.localExecutionBridges,
    [storage.chats.key]: t.sidepanel.chatHistory,
  } as Record<string, string>;
}
