import { Check, Copy, FolderSync } from "lucide-react";
import type { ReactNode } from "react";
import { getMessages } from "../../src/shared/i18n";
import {
  NO_SYNC_BACKEND_ID,
  syncBackendSupportsChatAttachments,
} from "../../src/shared/sync-backends";
import { createSyncConfigCode } from "../../src/shared/sync-config-code";
import type { SyncDataSettings } from "../../src/shared/sync-data-settings";
import {
  SYNC_BACKEND_TYPES,
  syncBackendDefaultName,
  WEBDAV_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backend-registry";
import type { SyncBackendConfig } from "../../src/shared/types";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
  AccordionTriggerButton,
  Button,
  CardDescription,
  CardTitle,
  Input,
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../src/ui/components";
import { useState } from "react";

type Messages = ReturnType<typeof getMessages>;

export type SyncDataToggle = {
  key: string;
  icon: ReactNode;
  title: string;
  description: string;
  value: boolean;
  attachmentBackendOnly?: boolean;
  onChange: (value: boolean) => void;
};

export function SyncBackendCard({
  activeBackendId,
  backends,
  dataToggles,
  syncDataSettings,
  onActiveBackendChange,
  onBackendsChange,
  t,
}: {
  activeBackendId: string;
  backends: SyncBackendConfig[];
  dataToggles: SyncDataToggle[];
  syncDataSettings: SyncDataSettings;
  onActiveBackendChange: (backendId: string) => void;
  onBackendsChange: (backends: SyncBackendConfig[]) => void;
  t: Messages;
}) {
  const [testingBackendId, setTestingBackendId] = useState<string>();
  const [copiedBackendId, setCopiedBackendId] = useState<string>();
  const browserBackend = backends.find(
    (backend) => backend.type === SYNC_BACKEND_TYPES.browserSync,
  )!;
  const webDavBackend = backends.find(
    (backend) => backend.type === SYNC_BACKEND_TYPES.webDav,
  );
  const webDavDraft: Extract<SyncBackendConfig, { type: "webdav" }> = {
    id: WEBDAV_SYNC_BACKEND_ID,
    type: SYNC_BACKEND_TYPES.webDav,
    name: webDavBackend?.name || syncBackendDefaultName(WEBDAV_SYNC_BACKEND_ID),
    url: webDavBackend?.url || "",
    username: webDavBackend?.username,
    password: webDavBackend?.password,
  };

  function updateWebDavBackend(
    patch: Partial<Extract<SyncBackendConfig, { type: "webdav" }>>,
  ) {
    const nextBackend = {
      ...webDavDraft,
      ...patch,
      id: WEBDAV_SYNC_BACKEND_ID,
      type: SYNC_BACKEND_TYPES.webDav,
      name:
        patch.name?.trim() ||
        webDavDraft.name ||
        syncBackendDefaultName(WEBDAV_SYNC_BACKEND_ID),
      url: patch.url ?? webDavDraft.url,
      username:
        patch.username === undefined
          ? webDavDraft.username
          : patch.username.trim() || undefined,
      password:
        patch.password === undefined
          ? webDavDraft.password
          : patch.password || undefined,
    };
    onBackendsChange([
      ...backends.filter(
        (backend) => backend.type !== SYNC_BACKEND_TYPES.webDav,
      ),
      nextBackend,
    ]);
  }

  function enableBackend(backendId: string, enabled: boolean) {
    if (backendId === WEBDAV_SYNC_BACKEND_ID && enabled && !webDavDraft.url)
      return;
    if (enabled && backendId !== activeBackendId)
      onActiveBackendChange(backendId);
    if (!enabled && backendId === activeBackendId)
      onActiveBackendChange(NO_SYNC_BACKEND_ID);
  }

  async function copyBackendConfig(backend: SyncBackendConfig) {
    setTestingBackendId(backend.id);
    try {
      await navigator.clipboard.writeText(
        createSyncConfigCode({ backend, syncDataSettings }),
      );
      setCopiedBackendId(backend.id);
      window.setTimeout(() => setCopiedBackendId(undefined), 1_200);
    } finally {
      setTestingBackendId(undefined);
    }
  }

  return (
    <Accordion type="multiple" className="stack">
      <SyncBackendHeaderItem
        backend={browserBackend}
        activeBackendId={activeBackendId}
        copying={testingBackendId === browserBackend.id}
        copied={copiedBackendId === browserBackend.id}
        onCopyConfig={() => copyBackendConfig(browserBackend)}
        onEnabledChange={(enabled) => enableBackend(browserBackend.id, enabled)}
        t={t}
      >
        <BackendDataTogglePanel
          active={browserBackend.id === activeBackendId}
          backendType={browserBackend.type}
          toggles={dataToggles}
          t={t}
        />
      </SyncBackendHeaderItem>
      <AccordionItem value={WEBDAV_SYNC_BACKEND_ID}>
        <AccordionHeader className="ui-accordion-header-with-actions">
          <AccordionTriggerButton hideChevron>
            <span className="settings-summary">
              <span className="settings-summary-title">
                <FolderSync size={18} />
                <span>{backendDisplayName(webDavDraft, t)}</span>
              </span>
              <small>{backendDescription(webDavDraft, t)}</small>
            </span>
          </AccordionTriggerButton>
          <span
            className="accordion-trigger-actions"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <BackendCopyConfigButton
              backend={webDavDraft}
              disabled={!webDavDraft.url}
              copying={testingBackendId === webDavDraft.id}
              copied={copiedBackendId === webDavDraft.id}
              onCopyConfig={() => copyBackendConfig(webDavDraft)}
              t={t}
            />
            <Switch
              checked={webDavDraft.id === activeBackendId}
              disabled={!webDavDraft.url}
              aria-label={backendDisplayName(webDavDraft, t)}
              onCheckedChange={(enabled) =>
                enableBackend(webDavDraft.id, enabled)
              }
            />
          </span>
          <AccordionTriggerButton
            className="accordion-chevron-trigger"
            aria-label={backendDisplayName(webDavDraft, t)}
          />
        </AccordionHeader>
        <AccordionContent>
          <div className="stack">
            <Label>
              {t.options.syncBackendName}
              <Input
                value={webDavDraft.name}
                onChange={(event) =>
                  updateWebDavBackend({ name: event.target.value })
                }
              />
            </Label>
            <Label>
              {t.options.syncBackendWebDavUrl}
              <Input
                value={webDavDraft.url}
                onChange={(event) =>
                  updateWebDavBackend({ url: event.target.value })
                }
              />
            </Label>
            <Label>
              {t.options.syncBackendUsername}
              <Input
                value={webDavDraft.username || ""}
                onChange={(event) =>
                  updateWebDavBackend({ username: event.target.value })
                }
              />
            </Label>
            <Label>
              {t.options.syncBackendPassword}
              <Input
                type="password"
                value={webDavDraft.password || ""}
                onChange={(event) =>
                  updateWebDavBackend({ password: event.target.value })
                }
              />
            </Label>
            <BackendDataTogglePanel
              active={webDavDraft.id === activeBackendId}
              backendType={webDavDraft.type}
              toggles={dataToggles}
              t={t}
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function SyncBackendHeaderItem({
  backend,
  activeBackendId,
  copying,
  copied,
  onCopyConfig,
  onEnabledChange,
  t,
  children,
}: {
  backend: SyncBackendConfig;
  activeBackendId: string;
  copying: boolean;
  copied: boolean;
  onCopyConfig: () => void;
  onEnabledChange: (enabled: boolean) => void;
  t: Messages;
  children?: ReactNode;
}) {
  return (
    <AccordionItem value={backend.id}>
      <AccordionHeader className="ui-accordion-header-with-actions">
        <AccordionTriggerButton hideChevron>
          <span className="settings-summary">
            <span className="settings-summary-title">
              <FolderSync size={18} />
              <span>{backendDisplayName(backend, t)}</span>
            </span>
            <small>{backendDescription(backend, t)}</small>
          </span>
        </AccordionTriggerButton>
        <span
          className="accordion-trigger-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <BackendCopyConfigButton
            backend={backend}
            copying={copying}
            copied={copied}
            onCopyConfig={onCopyConfig}
            t={t}
          />
          <Switch
            checked={backend.id === activeBackendId}
            aria-label={backendDisplayName(backend, t)}
            onCheckedChange={onEnabledChange}
          />
        </span>
        <AccordionTriggerButton
          className="accordion-chevron-trigger"
          aria-label={backendDisplayName(backend, t)}
        />
      </AccordionHeader>
      {children && <AccordionContent>{children}</AccordionContent>}
    </AccordionItem>
  );
}

function BackendDataTogglePanel({
  active,
  backendType,
  toggles,
  t,
}: {
  active: boolean;
  backendType: SyncBackendConfig["type"];
  toggles: SyncDataToggle[];
  t: Messages;
}) {
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
  return (
    <div className="settings-toggle-list">
      {toggles.map((toggle) => (
        <SyncToggleRow
          key={toggle.key}
          icon={toggle.icon}
          title={toggle.title}
          description={toggle.description}
          value={
            toggle.attachmentBackendOnly &&
            !syncBackendSupportsChatAttachments(backendType)
              ? false
              : toggle.value
          }
          disabled={
            disabled ||
            (toggle.attachmentBackendOnly &&
              !syncBackendSupportsChatAttachments(backendType))
          }
          onChange={toggle.onChange}
        />
      ))}
    </div>
  );
}

function SyncToggleRow({
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
    <div className="settings-toggle-row">
      <div>
        <CardTitle className="settings-section-title">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      <Switch
        checked={value}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function BackendCopyConfigButton({
  backend,
  copying,
  copied,
  onCopyConfig,
  disabled,
  t,
}: {
  backend: SyncBackendConfig;
  copying: boolean;
  copied: boolean;
  onCopyConfig: () => void;
  disabled?: boolean;
  t: Messages;
}) {
  const label = copied
    ? t.options.syncBackendCopiedConfig
    : t.options.syncBackendCopyConfig;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`${label}: ${backendDisplayName(backend, t)}`}
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

function backendDisplayName(backend: SyncBackendConfig, t: Messages) {
  return backend.type === SYNC_BACKEND_TYPES.browserSync
    ? t.options.syncBackendBrowserSync
    : t.options.syncBackendWebDavSync;
}

function backendDescription(backend: SyncBackendConfig, t: Messages) {
  return backend.type === SYNC_BACKEND_TYPES.webDav
    ? t.options.syncBackendWebDavSync
    : t.options.syncBackendBrowserSync;
}
