import type { ReactNode } from "react";
import {
  Activity,
  Cloud,
  Database,
  FileText,
  MessagesSquare,
} from "lucide-react";
import { getMessages } from "../../src/shared/i18n";
import {
  setDataSync,
  storage,
  SYNCABLE_DATA_ITEMS,
  type SyncPreferenceKey,
} from "../../src/shared/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Switch,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function SyncPage() {
  const [language] = useStoredState(storage.language);
  const [preferences, setPreferences] = useStoredState(storage.preferences);
  const [syncWriteStatus] = useStoredState(storage.syncWriteStatus);
  const t = getMessages(language);

  if (!preferences) return null;

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

  return (
    <div className="stack">
      <div>
        <h1 className="settings-page-title">
          <Cloud size={24} /> {t.options.sync}
        </h1>
        <p className="muted">{t.options.syncSettingsDescription}</p>
      </div>
      <SyncToggleCard
        icon={<Cloud size={18} />}
        title={t.options.syncSettings}
        description={t.options.syncSettingsDescription}
        value
        disabled
      />
      {SYNCABLE_DATA_ITEMS.filter(
        ({ preferenceKey }) => preferenceKey !== "syncProviders",
      ).map(({ preferenceKey }) => (
        <SyncToggleCard
          key={preferenceKey}
          title={syncToggleContent[preferenceKey].title}
          description={syncToggleContent[preferenceKey].description}
          icon={syncToggleContent[preferenceKey].icon}
          value={preferences[preferenceKey] === true}
          onChange={(value) => updateSyncPreference(preferenceKey, value)}
        />
      ))}
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
      ? `${pendingCount} pending write${pendingCount === 1 ? "" : "s"}`
      : status?.lastFlushedAt
        ? new Date(status.lastFlushedAt).toLocaleTimeString()
        : "";

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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncToggleCard({
  icon,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <div className="setting-switch-row">
          <div>
            <CardTitle className="settings-section-title">
              {icon} {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Switch
            checked={value}
            disabled={disabled}
            onCheckedChange={onChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
