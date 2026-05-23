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
} from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import { NO_SYNC_BACKEND_ID } from "../../src/shared/sync-backends";
import {
  setActiveSyncBackend,
  setDataSync,
  flushPendingSyncWrites,
  storage,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
  type SyncPreferenceKey,
} from "../../src/shared/storage";
import type { SyncBackendConfig } from "../../src/shared/types";
import { SYNC_DATA_SETTING_KEYS } from "../../src/shared/sync-data-settings";
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
  const [syncDataSettings, setSyncDataSettings] = useStoredState(
    storage.syncDataSettings,
  );
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId, setActiveSyncBackendId] = useStoredState(
    storage.activeSyncBackendId,
  );
  const [pendingActiveBackendId, setPendingActiveBackendId] =
    useState<string>();
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

  function updateSyncPreference(key: SyncPreferenceKey, value: boolean) {
    setSyncDataSettings((previous) => ({ ...previous, [key]: value }));
    setDataSync(key, value).catch((error) => {
      console.warn("Failed to update sync preference", error);
      setSyncDataSettings((previous) => ({ ...previous, [key]: !value }));
    });
  }

  function changeActiveBackend(backendId: string) {
    setPendingActiveBackendId(backendId);
    setActiveSyncBackend(backendId)
      .catch((error) => {
        console.warn("Failed to change sync backend", error);
        setActiveSyncBackendId(activeSyncBackendId || NO_SYNC_BACKEND_ID);
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
      value: syncDataSettings[preferenceKey] === true,
      onChange: (value: boolean) => updateSyncPreference(preferenceKey, value),
    })),
    {
      key: SYNC_DATA_SETTING_KEYS.chatAttachments,
      title: t.options.syncChatAttachments,
      description: t.options.syncChatAttachmentsDescription,
      icon: <Paperclip size={18} />,
      value: syncDataSettings[SYNC_DATA_SETTING_KEYS.chatAttachments] === true,
      attachmentBackendOnly: true,
      onChange: (value: boolean) =>
        setSyncDataSettings((previous) => ({
          ...previous,
          [SYNC_DATA_SETTING_KEYS.chatAttachments]: value,
        })),
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
  const hasError = !!status?.lastError;
  const title = hasError
    ? t.options.syncWriteError
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
            className={`sync-status-dot ${hasError ? "error" : pendingCount > 0 ? "pending" : ""}`}
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
    [storage.chats.key]: t.sidepanel.chatHistory,
  } as Record<string, string>;
}
