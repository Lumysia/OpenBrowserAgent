import { ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { syncBackendCapabilities } from "../../src/shared/sync-backends";
import type { SyncBackendType } from "../../src/shared/types";
import {
  Badge,
  SettingToggleRow,
  SettingsSection,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

// One group of what syncs. Without `value` it always syncs (no switch).
export type SyncDataToggle = {
  key: string;
  icon: ReactNode;
  title: string;
  description: string;
  value?: boolean;
  // Needs a backend that holds large content (chats, files).
  needsLargeContent?: boolean;
  onChange?: (value: boolean) => void;
  // Shown under the row (the passphrase).
  detail?: ReactNode;
};

// What syncs with the active backend; groups it can't hold are marked and
// stay off.
export function SyncDataList({
  backendType,
  toggles,
}: {
  backendType: SyncBackendType;
  toggles: SyncDataToggle[];
}) {
  const t = useMessages();
  const { largeContent } = syncBackendCapabilities(backendType);
  return (
    <SettingsSection icon={<ListChecks />} title={t.sync.whatSyncs}>
      <div className="settings-toggle-list">
        {toggles.map((toggle) => {
          const unsupported = toggle.needsLargeContent && !largeContent;
          return (
            <SettingToggleRow
              key={toggle.key}
              icon={toggle.icon}
              title={toggle.title}
              description={unsupported ? t.sync.webDavOnly : toggle.description}
              value={unsupported ? false : toggle.value}
              disabled={unsupported}
              onChange={toggle.onChange}
              aside={
                toggle.value === undefined ? (
                  <Badge>{t.sync.groupAlways}</Badge>
                ) : undefined
              }
            >
              {!unsupported && toggle.detail}
            </SettingToggleRow>
          );
        })}
      </div>
    </SettingsSection>
  );
}
