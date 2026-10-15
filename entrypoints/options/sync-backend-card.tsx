import { Check, Copy, FolderSync } from "lucide-react";
import type { ReactNode } from "react";
import { createSyncConfigCode } from "../../src/shared/sync-config-code";
import type { SyncGroupSettings } from "../../src/shared/storage-keys";
import {
  NO_SYNC_BACKEND_ID,
  SYNC_BACKEND_TYPES,
  syncBackendCapabilities,
  WEBDAV_SYNC_BACKEND_ID,
  webDavBackendOf,
  withWebDavPatch,
} from "../../src/shared/sync-backends";
import type { SyncBackendConfig } from "../../src/shared/types";
import {
  Accordion,
  Badge,
  Button,
  CardDescription,
  CommitInput,
  Label,
  SettingToggleRow,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  SettingsAccordionItem,
  SettingsSummary,
} from "../../src/ui/components";
import { useState } from "react";
import {
  syncBackendHint,
  syncBackendTitle,
} from "../../src/ui/sync-backend-display";
import { useTransient } from "../../src/ui/use-transient";
import { WebDavConnectionFields } from "../../src/ui/webdav-connection-fields";
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
  // Shown under the row while its backend is active (the passphrase).
  detail?: ReactNode;
};

export function SyncBackendCard({
  activeBackendId,
  backends,
  dataToggles,
  syncGroups,
  onActiveBackendChange,
  onBackendsChange,
}: {
  activeBackendId: string;
  backends: SyncBackendConfig[];
  dataToggles: SyncDataToggle[];
  syncGroups: SyncGroupSettings;
  onActiveBackendChange: (backendId: string) => void;
  onBackendsChange: (backends: SyncBackendConfig[]) => void;
}) {
  const t = useMessages();
  const [copyingBackendId, setCopyingBackendId] = useState<string>();
  const [copiedBackendId, showCopied] = useTransient<string>();
  const browserBackend = backends.find(
    (backend) => backend.type === SYNC_BACKEND_TYPES.browserSync,
  )!;
  const webDavBackend = webDavBackendOf(backends);

  function enableBackend(backendId: string, enabled: boolean) {
    if (backendId === WEBDAV_SYNC_BACKEND_ID && enabled && !webDavBackend.url)
      return;
    if (enabled && backendId !== activeBackendId)
      onActiveBackendChange(backendId);
    if (!enabled && backendId === activeBackendId)
      onActiveBackendChange(NO_SYNC_BACKEND_ID);
  }

  async function copyBackendConfig(backend: SyncBackendConfig) {
    setCopyingBackendId(backend.id);
    try {
      await navigator.clipboard.writeText(
        createSyncConfigCode({ backend, syncGroups }),
      );
      showCopied(backend.id);
    } finally {
      setCopyingBackendId(undefined);
    }
  }

  const header = (backend: SyncBackendConfig, usable = true) => ({
    value: backend.id,
    chevronLabel: syncBackendTitle(backend, t),
    summary: (
      <SettingsSummary
        icon={<FolderSync size={18} />}
        title={syncBackendTitle(backend, t)}
        description={syncBackendHint(backend.type, t)}
      />
    ),
    actions: (
      <>
        <BackendCopyConfigButton
          backend={backend}
          disabled={!usable}
          copying={copyingBackendId === backend.id}
          copied={copiedBackendId === backend.id}
          onCopyConfig={() => copyBackendConfig(backend)}
        />
        <Switch
          checked={backend.id === activeBackendId}
          disabled={!usable}
          aria-label={syncBackendTitle(backend, t)}
          onCheckedChange={(enabled) => enableBackend(backend.id, enabled)}
        />
      </>
    ),
  });
  const update = (patch: Parameters<typeof withWebDavPatch>[1]) =>
    onBackendsChange(withWebDavPatch(backends, patch));

  return (
    <Accordion type="multiple" className="stack">
      <SettingsAccordionItem {...header(browserBackend)}>
        <BackendDataTogglePanel
          active={browserBackend.id === activeBackendId}
          backendType={browserBackend.type}
          toggles={dataToggles}
        />
      </SettingsAccordionItem>
      <SettingsAccordionItem
        {...header(webDavBackend, !!webDavBackend.url)}
        contentClassName="stack"
      >
        <Label>
          {t.options.syncBackendName}
          <CommitInput
            value={webDavBackend.name}
            onCommit={(name) => update({ name })}
          />
        </Label>
        <WebDavConnectionFields backend={webDavBackend} onChange={update} />
        <BackendDataTogglePanel
          active={webDavBackend.id === activeBackendId}
          backendType={webDavBackend.type}
          toggles={dataToggles}
        />
      </SettingsAccordionItem>
    </Accordion>
  );
}

function BackendDataTogglePanel({
  active,
  backendType,
  toggles,
}: {
  active: boolean;
  backendType: SyncBackendConfig["type"];
  toggles: SyncDataToggle[];
}) {
  const t = useMessages();
  return (
    <div className="stack">
      <CardDescription>{t.options.syncBackendDescription}</CardDescription>
      <SyncDataToggleList
        toggles={toggles}
        disabled={!active}
        backendType={backendType}
      />
    </div>
  );
}

function SyncDataToggleList({
  toggles,
  disabled,
  backendType,
}: {
  toggles: SyncDataToggle[];
  disabled?: boolean;
  backendType: SyncBackendConfig["type"];
}) {
  const t = useMessages();
  return (
    <div className="settings-toggle-list">
      {toggles.map((toggle) => {
        const unsupported =
          toggle.needsLargeContent &&
          !syncBackendCapabilities(backendType).largeContent;
        return (
          <SettingToggleRow
            key={toggle.key}
            icon={toggle.icon}
            title={toggle.title}
            description={unsupported ? t.sync.webDavOnly : toggle.description}
            value={unsupported ? false : toggle.value}
            disabled={disabled || unsupported}
            onChange={toggle.onChange}
            aside={
              toggle.value === undefined ? (
                <Badge>{t.sync.groupAlways}</Badge>
              ) : undefined
            }
          >
            {!disabled && !unsupported && toggle.detail}
          </SettingToggleRow>
        );
      })}
    </div>
  );
}

function BackendCopyConfigButton({
  backend,
  copying,
  copied,
  onCopyConfig,
  disabled,
}: {
  backend: SyncBackendConfig;
  copying: boolean;
  copied: boolean;
  onCopyConfig: () => void;
  disabled?: boolean;
}) {
  const t = useMessages();
  const label = copied
    ? t.options.syncBackendCopiedConfig
    : t.options.syncBackendCopyConfig;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`${label}: ${syncBackendTitle(backend, t)}`}
          onClick={onCopyConfig}
          disabled={disabled || copying}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
