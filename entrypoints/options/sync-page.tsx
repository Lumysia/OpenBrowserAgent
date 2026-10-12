import type { ReactNode } from "react";
import {
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
  storage,
  SYNC_PREFERENCES,
  SYNC_PREFERENCE_KEYS,
  type SyncPreferenceKey,
  type SyncDataSettings,
} from "../../src/shared/storage";
import { SYNC_DATA_SETTING_KEYS } from "../../src/shared/storage-keys";
import { useStoredState } from "../../src/ui/useStoredState";
import { SyncBackendCard, type SyncDataToggle } from "./sync-backend-card";
import { SyncStatusCard } from "./sync-status-card";

export function SyncPage() {
  const [language] = useStoredState(storage.language);
  const [syncDataSettings] = useStoredState(storage.syncDataSettings);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId, setActiveSyncBackendId] = useStoredState(
    storage.activeSyncBackendId,
  );
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

  // Settings apply at once; the background sync follows storage changes.
  function updateSyncPreference(key: keyof SyncDataSettings, value: boolean) {
    void storage.syncDataSettings
      .update((settings) => ({ ...settings, [key]: value }))
      .catch((error) =>
        console.warn("Failed to update sync preference", error),
      );
  }

  const dataToggles: SyncDataToggle[] = [
    ...SYNC_PREFERENCE_KEYS.map((preferenceKey) => ({
      key: preferenceKey,
      title: syncToggleContent[preferenceKey].title,
      description: syncToggleContent[preferenceKey].description,
      icon: syncToggleContent[preferenceKey].icon,
      value: syncDataSettings[preferenceKey] === true,
      webDavOnly: preferenceKey === SYNC_PREFERENCES.chats,
      onChange: (value: boolean) => updateSyncPreference(preferenceKey, value),
    })),
    {
      key: SYNC_DATA_SETTING_KEYS.chatAttachments,
      title: t.options.syncChatAttachments,
      description: t.options.syncChatAttachmentsDescription,
      icon: <Paperclip size={18} />,
      value: syncDataSettings[SYNC_DATA_SETTING_KEYS.chatAttachments] === true,
      webDavOnly: true,
      onChange: (value: boolean) =>
        updateSyncPreference(SYNC_DATA_SETTING_KEYS.chatAttachments, value),
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
        syncDataSettings={syncDataSettings}
        onActiveBackendChange={setActiveSyncBackendId}
        onBackendsChange={setSyncBackends}
        t={t}
      />
      <SyncStatusCard t={t} />
    </div>
  );
}
