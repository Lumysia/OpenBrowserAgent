import { KeyRound } from "lucide-react";
import { useMessages } from "../../src/ui/messages";
import { SyncUnlockForm } from "../../src/ui/sync-unlock-form";
import { useSyncKeysLocked } from "../../src/ui/use-sync-keys-locked";

// Synced API keys wait for the sync passphrase: asked above the composer
// until entered, so a chat doesn't fail on a missing key first.
export function SyncKeysBanner() {
  const t = useMessages();
  if (!useSyncKeysLocked()) return null;
  return (
    <div className="composer-card sync-keys-banner" role="status">
      <div className="composer-card-header">
        <strong>
          <KeyRound size={15} aria-hidden="true" />
          {t.setup.keysLocked}
        </strong>
      </div>
      <SyncUnlockForm />
    </div>
  );
}
