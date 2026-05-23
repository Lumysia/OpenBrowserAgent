import { Check, FolderSync, TestTube2 } from "lucide-react";
import type { ReactNode } from "react";
import { getMessages } from "../../src/shared/i18n";
import {
  BROWSER_SYNC_BACKEND_ID,
  createSyncBackend,
  NO_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backends";
import {
  syncBackendRegistryItem,
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
  onChange: (value: boolean) => void;
};

export function SyncBackendCard({
  activeBackendId,
  backends,
  dataToggles,
  onActiveBackendChange,
  onBackendsChange,
  t,
}: {
  activeBackendId: string;
  backends: SyncBackendConfig[];
  dataToggles: SyncDataToggle[];
  onActiveBackendChange: (backendId: string) => void;
  onBackendsChange: (backends: SyncBackendConfig[]) => void;
  t: Messages;
}) {
  const [testingBackendId, setTestingBackendId] = useState<string>();
  const [testStatus, setTestStatus] = useState<
    Record<string, "success" | "error" | undefined>
  >({});
  const browserBackend = backends.find(
    (backend) => backend.type === "browser-sync",
  )!;
  const webDavBackend = backends.find((backend) => backend.type === "webdav");
  const webDavDraft: Extract<SyncBackendConfig, { type: "webdav" }> = {
    id: WEBDAV_SYNC_BACKEND_ID,
    type: "webdav",
    name:
      webDavBackend?.name ||
      syncBackendRegistryItem(WEBDAV_SYNC_BACKEND_ID)?.defaultName ||
      "WebDAV",
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
      type: "webdav" as const,
      name:
        patch.name?.trim() ||
        webDavDraft.name ||
        syncBackendRegistryItem(WEBDAV_SYNC_BACKEND_ID)?.defaultName ||
        "WebDAV",
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
      ...backends.filter((backend) => backend.type !== "webdav"),
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

  async function testBackend(backend: SyncBackendConfig) {
    setTestingBackendId(backend.id);
    setTestStatus((previous) => ({ ...previous, [backend.id]: undefined }));
    try {
      await createSyncBackend(backend).test();
      setTestStatus((previous) => ({ ...previous, [backend.id]: "success" }));
    } catch (error) {
      console.warn("Sync backend test failed", error);
      setTestStatus((previous) => ({ ...previous, [backend.id]: "error" }));
    } finally {
      setTestingBackendId(undefined);
    }
  }

  return (
    <Accordion type="multiple" className="stack">
      <SyncBackendHeaderItem
        backend={browserBackend}
        activeBackendId={activeBackendId}
        testing={testingBackendId === browserBackend.id}
        testStatus={testStatus[browserBackend.id]}
        onTest={() => testBackend(browserBackend)}
        onEnabledChange={(enabled) => enableBackend(browserBackend.id, enabled)}
        t={t}
      >
        <BackendDataTogglePanel
          active={browserBackend.id === activeBackendId}
          toggles={dataToggles}
          t={t}
        />
      </SyncBackendHeaderItem>
      <AccordionItem value="webdav">
        <AccordionHeader className="ui-accordion-header-with-actions">
          <AccordionTriggerButton hideChevron>
            <span className="agent-summary">
              <span className="agent-summary-title">
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
            <BackendTestButton
              backend={webDavDraft}
              disabled={!webDavDraft.url}
              testing={testingBackendId === webDavDraft.id}
              status={testStatus[webDavDraft.id]}
              onTest={() => testBackend(webDavDraft)}
              t={t}
            />
            <Switch
              checked={webDavDraft.id === activeBackendId}
              disabled={!webDavDraft.url}
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
                placeholder="https://example.com/dav/"
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
  testing,
  testStatus,
  onTest,
  onEnabledChange,
  t,
  children,
}: {
  backend: SyncBackendConfig;
  activeBackendId: string;
  testing: boolean;
  testStatus: "success" | "error" | undefined;
  onTest: () => void;
  onEnabledChange: (enabled: boolean) => void;
  t: Messages;
  children?: ReactNode;
}) {
  return (
    <AccordionItem value={backend.id}>
      <AccordionHeader className="ui-accordion-header-with-actions">
        <AccordionTriggerButton hideChevron>
          <span className="agent-summary">
            <span className="agent-summary-title">
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
          <BackendTestButton
            backend={backend}
            testing={testing}
            status={testStatus}
            onTest={onTest}
            t={t}
          />
          <Switch
            checked={backend.id === activeBackendId}
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
  toggles,
  t,
}: {
  active: boolean;
  toggles: SyncDataToggle[];
  t: Messages;
}) {
  return (
    <div className="stack">
      <CardDescription>{t.options.syncBackendDescription}</CardDescription>
      <SyncDataToggleList toggles={toggles} disabled={!active} />
    </div>
  );
}

function SyncDataToggleList({
  toggles,
  disabled,
}: {
  toggles: SyncDataToggle[];
  disabled?: boolean;
}) {
  return (
    <div className="settings-toggle-list">
      {toggles.map((toggle) => (
        <SyncToggleRow
          key={toggle.key}
          icon={toggle.icon}
          title={toggle.title}
          description={toggle.description}
          value={toggle.value}
          disabled={disabled}
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
      <Switch checked={value} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function BackendTestButton({
  backend,
  testing,
  status,
  onTest,
  disabled,
  t,
}: {
  backend: SyncBackendConfig;
  testing: boolean;
  status: "success" | "error" | undefined;
  onTest: () => void;
  disabled?: boolean;
  t: Messages;
}) {
  const label = testing
    ? t.options.syncBackendTesting
    : status === "success"
      ? t.options.syncBackendTestSuccess
      : status === "error"
        ? t.options.syncBackendTestError
        : t.options.syncBackendTest;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`${label}: ${backendDisplayName(backend, t)}`}
          onClick={onTest}
          disabled={disabled || testing}
        >
          {status === "success" ? <Check size={15} /> : <TestTube2 size={15} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function backendDisplayName(backend: SyncBackendConfig, t: Messages) {
  return backend.type === "browser-sync"
    ? t.options.syncBackendBrowserSync
    : t.options.syncBackendWebDavSync;
}

function backendDescription(backend: SyncBackendConfig, t: Messages) {
  return backend.type === "webdav"
    ? t.options.syncBackendWebDavSync
    : t.options.syncBackendBrowserSync;
}
