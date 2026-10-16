import { Check, Copy, MonitorSmartphone } from "lucide-react";
import type { SyncGroupSettings } from "../../src/shared/storage-keys";
import { SYNC_BACKEND_TYPES } from "../../src/shared/sync-backends";
import { createSyncConfigCode } from "../../src/shared/sync-config-code";
import type { SyncBackendConfig } from "../../src/shared/types";
import { Button, SettingsSection } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { SyncJoinDisclosure } from "../../src/ui/sync-join-form";
import { useTransient } from "../../src/ui/use-transient";

// Joining another device: copy this device's sync code, or paste one from
// there. Used once per device, so it comes last on the page.
export function SyncCodeSection({
  activeBackend,
  syncGroups,
}: {
  activeBackend: SyncBackendConfig | undefined;
  syncGroups: SyncGroupSettings;
}) {
  const t = useMessages();
  return (
    <SettingsSection
      icon={<MonitorSmartphone />}
      title={t.sync.codeTitle}
      contentClassName="stack"
    >
      {
        // Another device joins browser account sync by choosing it there.
        activeBackend?.type === SYNC_BACKEND_TYPES.webDav && (
          <div className="row">
            <CopySyncCodeButton
              backend={activeBackend}
              syncGroups={syncGroups}
            />
          </div>
        )
      }
      <SyncJoinDisclosure />
    </SettingsSection>
  );
}

// The active backend and what syncs, as a code another device pastes.
function CopySyncCodeButton({
  backend,
  syncGroups,
}: {
  backend: SyncBackendConfig;
  syncGroups: SyncGroupSettings;
}) {
  const t = useMessages();
  const [copied, showCopied] = useTransient<true>();
  return (
    <Button
      variant="outline"
      onClick={() =>
        navigator.clipboard
          .writeText(createSyncConfigCode({ backend, syncGroups }))
          .then(() => showCopied(true))
          .catch(console.warn)
      }
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? t.sync.codeCopied : t.sync.copyCode}
    </Button>
  );
}
