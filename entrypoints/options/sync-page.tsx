import { SettingsPageHeader } from "../../src/ui/components";
import {
  Cloud,
  FileText,
  KeyRound,
  MessagesSquare,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { getMessages } from "../../src/shared/i18n";
import { storage, SYNC_GROUPS, type SyncGroup } from "../../src/shared/storage";
import { useStoredState } from "../../src/ui/useStoredState";
import { SyncBackendCard, type SyncDataToggle } from "./sync-backend-card";
import { SyncKeysDetail } from "./sync-keys-detail";
import { SyncStatusCard } from "./sync-status-card";

export function SyncPage() {
  const [language] = useStoredState(storage.language);
  const [syncGroups] = useStoredState(storage.syncGroups);
  const [syncStatus] = useStoredState(storage.syncStatus);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId, setActiveSyncBackendId] = useStoredState(
    storage.activeSyncBackendId,
  );
  // Keys are being turned on: the passphrase form shows first.
  const [askingPassphrase, setAskingPassphrase] = useState(false);
  const t = getMessages(language);

  if (!syncGroups || !syncBackends || !activeSyncBackendId || !syncStatus)
    return null;

  // Settings apply at once; the background sync follows storage changes.
  function updateGroup(group: SyncGroup, value: boolean) {
    void storage.syncGroups
      .update((groups) => ({ ...groups, [group]: value }))
      .catch((error) => console.warn("Failed to update sync groups", error));
  }

  const dataToggles: SyncDataToggle[] = [
    {
      key: "settings",
      title: t.sync.groupSettings,
      description: t.sync.groupSettingsDescription,
      icon: <Settings size={18} />,
    },
    {
      key: SYNC_GROUPS.keys,
      title: t.sync.groupKeys,
      description: t.sync.groupKeysDescription,
      icon: <KeyRound size={18} />,
      value: syncGroups[SYNC_GROUPS.keys],
      // Turning keys on asks for the passphrase first; setting it turns
      // them on. Turning them off removes the keys from the server.
      onChange: (value) => {
        setAskingPassphrase(value);
        if (!value) updateGroup(SYNC_GROUPS.keys, false);
      },
      detail: (
        <SyncKeysDetail
          on={syncGroups[SYNC_GROUPS.keys]}
          keys={syncStatus.keys}
          asking={askingPassphrase}
          onClose={() => setAskingPassphrase(false)}
          t={t}
        />
      ),
    },
    {
      key: SYNC_GROUPS.chats,
      title: t.sync.groupChats,
      description: t.sync.groupChatsDescription,
      icon: <MessagesSquare size={18} />,
      value: syncGroups[SYNC_GROUPS.chats],
      needsLargeContent: true,
      onChange: (value) => updateGroup(SYNC_GROUPS.chats, value),
    },
    {
      key: SYNC_GROUPS.files,
      title: t.sync.groupFiles,
      description: t.sync.groupFilesDescription,
      icon: <FileText size={18} />,
      value: syncGroups[SYNC_GROUPS.files],
      needsLargeContent: true,
      onChange: (value) => updateGroup(SYNC_GROUPS.files, value),
    },
  ];

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Cloud />}
        title={t.options.sync}
        description={t.options.syncSettingsDescription}
      />
      <SyncBackendCard
        activeBackendId={activeSyncBackendId}
        backends={syncBackends}
        dataToggles={dataToggles}
        syncGroups={syncGroups}
        onActiveBackendChange={setActiveSyncBackendId}
        onBackendsChange={setSyncBackends}
        t={t}
      />
      <SyncStatusCard t={t} />
    </div>
  );
}
