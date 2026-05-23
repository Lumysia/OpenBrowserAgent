import type { ReactNode } from "react";
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
  storage,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCE_KEYS,
  type SyncPreferenceKey,
} from "../../src/shared/storage";
import type { SyncBackendConfig } from "../../src/shared/types";
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
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId, setActiveSyncBackendId] = useStoredState(
    storage.activeSyncBackendId,
  );
  const [syncWriteStatus] = useStoredState(storage.syncWriteStatus);
  const t = getMessages(language);

  if (!preferences || !syncBackends || !activeSyncBackendId) return null;
  const syncToggleContent: Record<
    SyncPreferenceKey,
    { title: string; description: string; icon: ReactNode }
  > = {
    syncProviders: {
      title: t.options.syncProviders,
      description: t.options.syncProvidersDescription,
      icon: <Database size={18} />,
    },
    syncSkills: {
      title: t.options.syncSkills,
      description: t.options.syncSkillsDescription,
      icon: <FileText size={18} />,
    },
    syncMcpServers: {
      title: t.options.syncMcpServers,
      description: t.options.syncMcpServersDescription,
      icon: <Plug size={18} />,
    },
    syncAgents: {
      title: t.options.syncAgents,
      description: t.options.syncAgentsDescription,
      icon: <Bot size={18} />,
    },
    syncChats: {
      title: t.options.syncChats,
      description: t.options.syncChatsDescription,
      icon: <MessagesSquare size={18} />,
    },
  };

  function updateSyncPreference(key: SyncPreferenceKey, value: boolean) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
    setDataSync(key, value).catch((error) => {
      console.warn("Failed to update sync preference", error);
      setPreferences((previous) => ({ ...previous, [key]: !value }));
    });
  }

  function changeActiveBackend(backendId: string) {
    const previousActiveBackendId = activeSyncBackendId || NO_SYNC_BACKEND_ID;
    setActiveSyncBackend(backendId)
      .then(() => setActiveSyncBackendId(backendId))
      .catch((error) => {
        console.warn("Failed to change sync backend", error);
        setActiveSyncBackendId(previousActiveBackendId);
      });
  }

  function updateBackends(nextBackends: SyncBackendConfig[]) {
    setSyncBackends(nextBackends);
  }

  const dataToggles: SyncDataToggle[] = [
    ...SYNC_PREFERENCE_KEYS.filter(
      (preferenceKey) => preferenceKey !== "syncProviders",
    ).map((preferenceKey) => ({
      key: preferenceKey,
      title: syncToggleContent[preferenceKey].title,
      description: syncToggleContent[preferenceKey].description,
      icon: syncToggleContent[preferenceKey].icon,
      value: preferences[preferenceKey] === true,
      onChange: (value: boolean) => updateSyncPreference(preferenceKey, value),
    })),
    {
      key: "syncChatAttachments",
      title: t.options.syncChatAttachments,
      description: t.options.syncChatAttachmentsDescription,
      icon: <Paperclip size={18} />,
      value: preferences.syncChatAttachments === true,
      attachmentBackendOnly: true,
      onChange: (value: boolean) =>
        setPreferences((previous) => ({
          ...previous,
          syncChatAttachments: value,
        })),
    },
  ];

  return (
    <div className="stack">
      <div>
        <h1 className="settings-page-title">
          <Cloud size={24} /> {t.options.sync}
        </h1>
        <p className="muted">{t.options.syncSettingsDescription}</p>
      </div>
      <SyncBackendCard
        activeBackendId={activeSyncBackendId}
        backends={syncBackends}
        dataToggles={dataToggles}
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
    [storage.agents.key]: t.options.agents,
    [storage.agentWorkspaces.key]: t.options.syncAgents,
    [storage.skills.key]: t.options.skills,
    [storage.mcpServers.key]: t.options.mcpServers,
    [storage.chats.key]: t.sidepanel.chatHistory,
  } as Record<string, string>;
}
