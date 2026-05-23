import { Bot, Cloud, Languages, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LOCAL_SETUP_FEEDBACK_MS, OPTIONS_HASH } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import {
  setActiveSyncBackend,
  storage,
  STORAGE_KEYS,
} from "../../src/shared/storage";
import { completeLocalBootstrapState } from "../../src/shared/storage-debug";
import { markSyncLocalCacheFlushed } from "../../src/shared/storage-sync-cache";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  SYNC_BACKEND_REGISTRY,
  syncBackendRegistryItem,
  WEBDAV_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backend-registry";
import { createSyncBackend } from "../../src/shared/sync-backends";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { ProviderState, SyncBackendConfig } from "../../src/shared/types";
import { languageLabels } from "../../src/shared/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";

export function ProvidersEmptyState({ t }: { t: Messages }) {
  const [language, setLanguage] = useStoredState(storage.language);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [activeSyncBackendId, setActiveSyncBackendId] = useStoredState(
    storage.activeSyncBackendId,
  );
  const [selectedBackendId, setSelectedBackendId] = useState(
    activeSyncBackendId === WEBDAV_SYNC_BACKEND_ID
      ? WEBDAV_SYNC_BACKEND_ID
      : BROWSER_SYNC_BACKEND_ID,
  );
  const [syncing, setSyncing] = useState(false);
  const [syncAction, setSyncAction] = useState<"test" | "confirm">("test");
  const [startingLocal, setStartingLocal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "ready" | "empty" | "synced" | "error"
  >(
    activeSyncBackendId && activeSyncBackendId !== NO_SYNC_BACKEND_ID
      ? "synced"
      : "idle",
  );
  const [cloudProviderState, setCloudProviderState] = useState<ProviderState>();

  useEffect(() => {
    if (!activeSyncBackendId || activeSyncBackendId === NO_SYNC_BACKEND_ID) {
      setSyncStatus("idle");
      return;
    }
    setSelectedBackendId(activeSyncBackendId);
    setSyncStatus("synced");
  }, [activeSyncBackendId]);

  if (!language || !syncBackends || !activeSyncBackendId) return null;
  const loadedSyncBackends = syncBackends;
  const hasActiveSyncBackend = activeSyncBackendId !== NO_SYNC_BACKEND_ID;

  const webDavBackend = loadedSyncBackends.find(
    (backend) => backend.type === "webdav",
  );
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
  const canPull =
    selectedBackendId !== WEBDAV_SYNC_BACKEND_ID || !!webDavDraft.url;

  function updateWebDavBackend(
    patch: Partial<Extract<SyncBackendConfig, { type: "webdav" }>>,
  ) {
    if (hasActiveSyncBackend) return;
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
    setSyncBackends([
      ...loadedSyncBackends.filter((backend) => backend.type !== "webdav"),
      nextBackend,
    ]);
    setSyncStatus("idle");
  }

  function selectedBackendConfig(): SyncBackendConfig {
    if (selectedBackendId === WEBDAV_SYNC_BACKEND_ID) return webDavDraft;
    return (
      loadedSyncBackends.find((backend) => backend.id === selectedBackendId) ||
      loadedSyncBackends[0]
    );
  }

  async function testCloudBackend() {
    setSyncing(true);
    setSyncAction("test");
    setSyncStatus("idle");
    try {
      const backend = createSyncBackend(selectedBackendConfig());
      await backend.test();
      const syncedProviders = await backend.read<ProviderState>(
        STORAGE_KEYS.provider,
      );
      const syncedModelCount = Object.values(syncedProviders || {}).flatMap(
        (provider) => provider?.models || [],
      ).length;
      setCloudProviderState(syncedModelCount > 0 ? syncedProviders : undefined);
      setSyncStatus(syncedModelCount > 0 ? "ready" : "empty");
    } catch (error) {
      console.warn("Failed to test sync backend", error);
      setSyncStatus("error");
    } finally {
      setSyncing(false);
    }
  }

  async function confirmCloudSync() {
    setSyncing(true);
    setSyncAction("confirm");
    try {
      await storage.syncBackends.set(loadedSyncBackends);
      if (syncStatus === "ready" && cloudProviderState)
        await markSyncLocalCacheFlushed(
          STORAGE_KEYS.provider,
          cloudProviderState,
        );
      await storage.preferences.set({
        ...(await storage.preferences.get()),
        syncProviders: true,
      });
      await setActiveSyncBackend(selectedBackendId);
      setActiveSyncBackendId(selectedBackendId);
      await completeLocalBootstrapState();
      setSyncStatus("synced");
    } catch (error) {
      console.warn("Failed to confirm cloud sync", error);
      setSyncStatus("error");
    } finally {
      setSyncing(false);
    }
  }

  function handleCloudAction() {
    if (syncStatus === "ready" || syncStatus === "empty") {
      confirmCloudSync().catch(() => undefined);
      return;
    }
    testCloudBackend().catch(() => undefined);
  }

  async function startLocally() {
    if (startingLocal) return;
    setStartingLocal(true);
    window.setTimeout(() => setStartingLocal(false), LOCAL_SETUP_FEEDBACK_MS);
    openOrFocusOptions(OPTIONS_HASH.providers).catch(console.warn);
  }

  const syncMessage =
    syncStatus === "synced"
      ? t.sidepanel.cloudSyncSynced
      : syncStatus === "ready"
        ? t.sidepanel.cloudSyncReady
        : syncStatus === "empty"
          ? t.sidepanel.cloudSyncEmpty
          : syncStatus === "error"
            ? t.sidepanel.cloudSyncError
            : t.sidepanel.cloudSyncDescription;
  const cloudActionLabel = syncing
    ? syncAction === "test"
      ? t.sidepanel.cloudSyncTesting
      : t.sidepanel.cloudSyncPulling
    : syncStatus === "ready"
      ? t.sidepanel.startFromCloud
      : syncStatus === "empty"
        ? t.sidepanel.confirmCloudSync
        : syncStatus === "synced"
          ? t.sidepanel.cloudSyncSyncedButton
          : t.sidepanel.cloudSyncTest;
  const syncStatusMessage = syncing ? cloudActionLabel : syncMessage;
  const secondaryStartLabel =
    syncStatus === "synced"
      ? t.sidepanel.bootstrapStepProviderTitle
      : t.sidepanel.startLocally;

  return (
    <div className="sidepanel bootstrap-mode">
      <div className="messages-shell">
        <ScrollArea className="messages">
          <div className="empty">
            <Card className="stack bootstrap-card">
              <CardHeader>
                <Bot size={34} />
                <CardTitle>{t.sidepanel.connectProviderTitle}</CardTitle>
                <CardDescription>
                  {t.sidepanel.connectProviderDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="stack">
                <div className="bootstrap-steps">
                  <BootstrapStep
                    number="1"
                    title={t.common.language}
                    description={t.options.languageDescription}
                    active
                  >
                    <div className="bootstrap-actions">
                      <Select
                        value={language || "en-US"}
                        onValueChange={setLanguage}
                      >
                        <SelectTrigger>
                          <Languages size={16} />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(languageLabels).map(([id, label]) => (
                            <SelectItem key={id} value={id}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </BootstrapStep>
                  <BootstrapStep
                    number="2"
                    title={t.sidepanel.bootstrapStepSyncTitle}
                    description={t.sidepanel.cloudSyncDescription}
                    active
                  >
                    <div className="bootstrap-actions">
                      <Select
                        value={selectedBackendId}
                        onValueChange={(backendId) => {
                          setSelectedBackendId(backendId);
                          setSyncStatus("idle");
                        }}
                        disabled={syncing || hasActiveSyncBackend}
                      >
                        <SelectTrigger>
                          <Cloud size={16} />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYNC_BACKEND_REGISTRY.map((backend) => (
                            <SelectItem key={backend.id} value={backend.id}>
                              {backend.id === BROWSER_SYNC_BACKEND_ID
                                ? t.options.syncBackendBrowserSync
                                : backend.defaultName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div
                        aria-hidden={
                          selectedBackendId !== WEBDAV_SYNC_BACKEND_ID
                        }
                        className={`bootstrap-backend-fields ${selectedBackendId === WEBDAV_SYNC_BACKEND_ID ? "is-visible" : ""}`}
                      >
                        <Label>
                          {t.options.syncBackendWebDavUrl}
                          <Input
                            value={webDavDraft.url}
                            placeholder="https://example.com/dav/"
                            disabled={
                              selectedBackendId !== WEBDAV_SYNC_BACKEND_ID ||
                              syncing ||
                              hasActiveSyncBackend
                            }
                            onChange={(event) =>
                              updateWebDavBackend({ url: event.target.value })
                            }
                          />
                        </Label>
                        <Label>
                          {t.options.syncBackendUsername}
                          <Input
                            value={webDavDraft.username || ""}
                            disabled={
                              selectedBackendId !== WEBDAV_SYNC_BACKEND_ID ||
                              syncing ||
                              hasActiveSyncBackend
                            }
                            onChange={(event) =>
                              updateWebDavBackend({
                                username: event.target.value,
                              })
                            }
                          />
                        </Label>
                        <Label>
                          {t.options.syncBackendPassword}
                          <Input
                            type="password"
                            value={webDavDraft.password || ""}
                            disabled={
                              selectedBackendId !== WEBDAV_SYNC_BACKEND_ID ||
                              syncing ||
                              hasActiveSyncBackend
                            }
                            onChange={(event) =>
                              updateWebDavBackend({
                                password: event.target.value,
                              })
                            }
                          />
                        </Label>
                      </div>
                      {syncStatus !== "idle" || syncing ? (
                        <CardDescription
                          key={syncStatusMessage}
                          className={`bootstrap-feedback-card ${syncStatus === "error" ? "is-error" : ""}`}
                        >
                          {syncStatusMessage}
                        </CardDescription>
                      ) : null}
                      <Button
                        className={`ui-button-soft-accent bootstrap-cloud-action ${syncing ? "is-loading" : ""}`}
                        onClick={handleCloudAction}
                        disabled={!canPull || syncing || hasActiveSyncBackend}
                      >
                        <Cloud className={syncing ? "spin" : ""} size={16} />
                        <span
                          key={cloudActionLabel}
                          className="bootstrap-action-label"
                        >
                          {cloudActionLabel}
                        </span>
                      </Button>
                    </div>
                  </BootstrapStep>
                  <BootstrapStep
                    number="3"
                    title={t.sidepanel.bootstrapStepProviderTitle}
                    description={t.sidepanel.bootstrapStepProviderDescription}
                  >
                    <div className="bootstrap-actions">
                      <Button
                        variant="secondary"
                        onClick={startLocally}
                        disabled={startingLocal}
                      >
                        <Settings size={16} />
                        <span
                          key={secondaryStartLabel}
                          className="bootstrap-action-label"
                        >
                          {secondaryStartLabel}
                        </span>
                      </Button>
                      <CardDescription
                        aria-hidden={!startingLocal}
                        className={`bootstrap-feedback-card local-setup-hint ${startingLocal ? "visible" : ""}`}
                      >
                        {t.sidepanel.localSetupHint}
                      </CardDescription>
                    </div>
                  </BootstrapStep>
                  <BootstrapStep
                    number="4"
                    title={t.sidepanel.bootstrapStepTaskTitle}
                    description={t.sidepanel.bootstrapStepTaskDescription}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function BootstrapStep({
  number,
  title,
  description,
  active,
  children,
}: {
  number: string;
  title: string;
  description: string;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="bootstrap-step">
      <Badge className={active ? "" : "bootstrap-step-muted"}>{number}</Badge>
      <strong className="bootstrap-step-title">{title}</strong>
      <div className="stack bootstrap-step-copy">
        <CardDescription key={description} className="bootstrap-status-copy">
          {description}
        </CardDescription>
        {children}
      </div>
    </div>
  );
}
