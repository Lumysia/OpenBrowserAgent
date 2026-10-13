import { Bot, Languages, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LOCAL_SETUP_FEEDBACK_MS, OPTIONS_HASH } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { completeLocalBootstrapState } from "../../src/shared/storage-debug";
import type { SyncDataSettings } from "../../src/shared/storage-keys";
import { parseSyncConfigCode } from "../../src/shared/sync-config-code";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  SYNC_BACKEND_TYPES,
  syncBackendDefaultName,
  WEBDAV_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backends";
import { checkSyncBackend, syncNow } from "../../src/shared/sync/client";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { SyncBackendConfig } from "../../src/shared/types";
import { languageLabels } from "../../src/shared/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
} from "../../src/ui/components";
import { useStoredState } from "../../src/ui/useStoredState";
import { SyncBootstrapStep } from "./sync-bootstrap-step";

export function ProvidersEmptyState({ t }: { t: Messages }) {
  const [language, setLanguage] = useStoredState(storage.language);
  const [syncBackends, setSyncBackends] = useStoredState(storage.syncBackends);
  const [syncDataSettings] = useStoredState(storage.syncDataSettings);
  const [activeSyncBackendId] = useStoredState(storage.activeSyncBackendId);
  const [selectedBackendId, setSelectedBackendId] = useState<string>(
    activeSyncBackendId === WEBDAV_SYNC_BACKEND_ID
      ? WEBDAV_SYNC_BACKEND_ID
      : BROWSER_SYNC_BACKEND_ID,
  );
  const [syncSetupMode, setSyncSetupMode] = useState<"code" | "manual">("code");
  const [syncCodeDraft, setSyncCodeDraft] = useState("");
  const [syncCodeInvalid, setSyncCodeInvalid] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAction, setSyncAction] = useState<"test" | "confirm">("test");
  const [startingLocal, setStartingLocal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "error">(
    activeSyncBackendId && activeSyncBackendId !== NO_SYNC_BACKEND_ID
      ? "synced"
      : "idle",
  );

  useEffect(() => {
    if (!activeSyncBackendId || activeSyncBackendId === NO_SYNC_BACKEND_ID) {
      setSyncStatus("idle");
      return;
    }
    setSelectedBackendId(activeSyncBackendId);
    setSyncStatus("synced");
  }, [activeSyncBackendId]);

  if (!language || !syncBackends || !syncDataSettings || !activeSyncBackendId)
    return null;
  const loadedSyncBackends = syncBackends;
  const hasActiveSyncBackend = activeSyncBackendId !== NO_SYNC_BACKEND_ID;

  const webDavBackend = loadedSyncBackends.find(
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
  const canPull =
    syncSetupMode === "code"
      ? !!syncCodeDraft.trim()
      : selectedBackendId !== WEBDAV_SYNC_BACKEND_ID || !!webDavDraft.url;

  function updateWebDavBackend(
    patch: Partial<Extract<SyncBackendConfig, { type: "webdav" }>>,
  ) {
    if (hasActiveSyncBackend) return;
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
    setSyncBackends([
      ...loadedSyncBackends.filter(
        (backend) => backend.type !== SYNC_BACKEND_TYPES.webDav,
      ),
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

  // Test the backend and, when it works, start syncing at once. A device
  // joining an account takes the account's data where it is newer; what only
  // this device has is uploaded.
  async function connectCloud({
    backend,
    backends,
    codeSettings,
  }: {
    backend: SyncBackendConfig;
    backends: SyncBackendConfig[];
    codeSettings?: SyncDataSettings;
  }) {
    setSyncing(true);
    setSyncAction("test");
    setSyncStatus("idle");
    try {
      await checkSyncBackend(backend);
      setSyncAction("confirm");
      await storage.syncBackends.set(backends);
      // The setup code's settings replace this device's on purpose.
      if (codeSettings) await storage.syncDataSettings.replace(codeSettings);
      await storage.activeSyncBackendId.set(backend.id);
      const status = await syncNow();
      if (status.error) throw new Error(status.error);
      await completeLocalBootstrapState();
      setSyncStatus("synced");
    } catch (error) {
      console.warn("Failed to connect sync backend", error);
      setSyncStatus("error");
    } finally {
      setSyncing(false);
    }
  }

  function handleCloudAction() {
    if (hasActiveSyncBackend) return;
    if (syncSetupMode === "manual") {
      void connectCloud({
        backend: selectedBackendConfig(),
        backends: loadedSyncBackends,
      });
      return;
    }
    let parsed;
    try {
      parsed = parseSyncConfigCode(syncCodeDraft);
    } catch (error) {
      console.warn("Failed to parse sync config code", error);
      setSyncCodeInvalid(true);
      return;
    }
    const { backend, syncDataSettings: codeSettings } = parsed;
    setSelectedBackendId(backend.id);
    void connectCloud({
      backend,
      backends: [
        ...loadedSyncBackends.filter(
          (existing) => existing.type !== backend.type,
        ),
        backend,
      ],
      codeSettings,
    });
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
      : syncStatus === "error"
        ? t.sidepanel.cloudSyncError
        : t.sidepanel.cloudSyncDescription;
  const cloudActionLabel = syncing
    ? syncAction === "test"
      ? t.sidepanel.cloudSyncTesting
      : t.sidepanel.cloudSyncPulling
    : syncStatus === "synced"
      ? t.sidepanel.cloudSyncSyncedButton
      : t.sidepanel.cloudSyncConnect;
  const setupFeedbackMessage =
    syncStatus !== "idle" || syncing
      ? syncing
        ? cloudActionLabel
        : syncMessage
      : syncCodeInvalid
        ? t.sidepanel.syncConfigCodeInvalid
        : "";
  const setupFeedbackError = syncStatus === "error" || syncCodeInvalid;
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
                    <SyncBootstrapStep
                      t={t}
                      selectedBackendId={selectedBackendId}
                      setSelectedBackendId={(backendId) => {
                        setSelectedBackendId(backendId);
                        setSyncStatus("idle");
                      }}
                      webDavDraft={webDavDraft}
                      updateWebDavBackend={updateWebDavBackend}
                      syncSetupMode={syncSetupMode}
                      setSyncSetupMode={setSyncSetupMode}
                      syncCodeDraft={syncCodeDraft}
                      setSyncCodeDraft={(value) => {
                        setSyncCodeDraft(value);
                        setSyncCodeInvalid(false);
                        setSyncStatus("idle");
                      }}
                      setupFeedbackMessage={setupFeedbackMessage}
                      setupFeedbackError={setupFeedbackError}
                      syncing={syncing}
                      hasActiveSyncBackend={hasActiveSyncBackend}
                      canPull={canPull}
                      cloudActionLabel={cloudActionLabel}
                      handleCloudAction={handleCloudAction}
                    />
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
