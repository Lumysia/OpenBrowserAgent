import { SettingsPageHeader, SettingsSection } from "../../src/ui/components";
import {
  Cloud,
  FileText,
  KeyRound,
  MessagesSquare,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { storage } from "../../src/shared/storage";
import { SYNC_GROUPS, type SyncGroup } from "../../src/shared/storage-keys";
import { useStoredState } from "../../src/ui/useStoredState";
import { SyncBackendChoice } from "./sync-backend-choice";
import { SyncCodeSection } from "./sync-code-section";
import { SyncDataList, type SyncDataToggle } from "./sync-data-list";
import { SyncKeysDetail } from "./sync-keys-detail";
import { SyncStatusCard } from "./sync-status-card";
import { SyncUnlockForm } from "../../src/ui/sync-unlock-form";
import { useSyncKeysLocked } from "../../src/ui/use-sync-keys-locked";
import { useMessages } from "../../src/ui/messages";

export function SyncPage() {
  const [syncGroups] = useStoredState(storage.syncGroups);
  const [syncStatus] = useStoredState(storage.syncStatus);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId, setActiveSyncBackendId] = useStoredState(
    storage.activeSyncBackendId,
  );
  // Keys are being turned on: the passphrase form shows first.
  const [askingPassphrase, setAskingPassphrase] = useState(false);
  const keysLocked = useSyncKeysLocked();
  const t = useMessages();

  if (!syncGroups || !syncBackends || !activeSyncBackendId || !syncStatus)
    return null;
  const activeBackend = syncBackends.find(
    (backend) => backend.id === activeSyncBackendId,
  );

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
        />
      ),
    },
  ];

  return (
    <div className="stack">
      <SettingsPageHeader
        icon={<Cloud />}
        title={t.options.sync}
        description={t.options.syncSettingsDescription}
      />
      {keysLocked && <SyncUnlockCard />}
      <SyncBackendChoice
        activeBackendId={activeSyncBackendId}
        backends={syncBackends}
        onActiveBackendChange={setActiveSyncBackendId}
        onBackendsChange={setSyncBackends}
      />
      <SyncStatusCard />
      {activeBackend && (
        <SyncDataList backendType={activeBackend.type} toggles={dataToggles} />
      )}
      <SyncCodeSection activeBackend={activeBackend} syncGroups={syncGroups} />
    </div>
  );
}

// Synced API keys wait for the passphrase another device set: asked first
// on the page, whichever way sync was connected.
function SyncUnlockCard() {
  const t = useMessages();
  return (
    <SettingsSection
      icon={<KeyRound />}
      title={t.setup.keysLocked}
      description={t.sync.passphraseEnter}
      className="sync-unlock-card"
    >
      <SyncUnlockForm />
    </SettingsSection>
  );
}
