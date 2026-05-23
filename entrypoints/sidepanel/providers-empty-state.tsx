import { Bot, Languages, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LOCAL_SETUP_FEEDBACK_MS, OPTIONS_HASH } from "../../src/shared/config";
import { mergePreferences } from "../../src/shared/default-preferences";
import type { Messages } from "../../src/shared/i18n";
import {
  setActiveSyncBackend,
  storage,
  STORAGE_KEYS,
  SYNCABLE_DATA_ITEMS,
  SYNC_PREFERENCE_KEYS,
} from "../../src/shared/storage";
import { completeLocalBootstrapState } from "../../src/shared/storage-debug";
import { restoreSyncBackendFromCloud } from "../../src/shared/storage-sync-transition";
import { parseSyncConfigCode } from "../../src/shared/sync-config-code";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  syncBackendRegistryItem,
  WEBDAV_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backend-registry";
import {
  createSyncBackend,
  type SyncBackend,
} from "../../src/shared/sync-backends";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type { Preferences, SyncBackendConfig } from "../../src/shared/types";
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

type CloudBootstrapState = {
  language?: string;
  preferences?: Preferences;
  data: Record<string, unknown>;
};

const BOOTSTRAP_CLOUD_DATA_KEYS = SYNCABLE_DATA_ITEMS.map(
  (item) => item.dataKey,
);

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
  const [syncSetupMode, setSyncSetupMode] = useState<"code" | "manual">("code");
  const [syncCodeDraft, setSyncCodeDraft] = useState("");
  const [syncCodeStatus, setSyncCodeStatus] = useState<
    "idle" | "applied" | "error"
  >("idle");
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
  const [cloudBootstrapState, setCloudBootstrapState] =
    useState<CloudBootstrapState>();

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

  function applySyncConfigCode() {
    if (hasActiveSyncBackend) return;
    try {
      const backend = parseSyncConfigCode(syncCodeDraft);
      setSyncBackends([
        ...loadedSyncBackends.filter(
          (existing) => existing.type !== backend.type,
        ),
        backend,
      ]);
      setSelectedBackendId(backend.id);
      setSyncStatus("idle");
      setSyncCodeStatus("applied");
    } catch (error) {
      console.warn("Failed to parse sync config code", error);
      setSyncCodeStatus("error");
    }
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
      const cloudState = await readCloudBootstrapState(backend);
      const hasExistingCloudConfig = hasCloudBootstrapData(cloudState);
      setCloudBootstrapState(hasExistingCloudConfig ? cloudState : undefined);
      setSyncStatus(hasExistingCloudConfig ? "ready" : "empty");
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
      if (syncStatus === "ready" && cloudBootstrapState) {
        await restoreCloudBootstrapState(cloudBootstrapState);
      } else {
        await storage.preferences.set({
          ...(await storage.preferences.get()),
          syncProviders: true,
        });
        await setActiveSyncBackend(selectedBackendId);
      }
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

  async function restoreCloudBootstrapState(cloudState: CloudBootstrapState) {
    const restoredPreferences = mergePreferences(
      cloudState.preferences || (await storage.preferences.get()),
    );
    for (const preferenceKey of SYNC_PREFERENCE_KEYS) {
      restoredPreferences[preferenceKey] = SYNCABLE_DATA_ITEMS.some(
        (item) =>
          item.preferenceKey === preferenceKey &&
          hasCloudValue(cloudState.data[item.dataKey]),
      );
    }
    await restoreSyncBackendFromCloud({
      backendId: selectedBackendId,
      language: cloudState.language,
      preferences: restoredPreferences,
      data: cloudState.data,
      setActiveBackendId: storage.activeSyncBackendId.set,
    });
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
  const setupFeedbackMessage =
    syncStatus !== "idle" || syncing
      ? syncStatusMessage
      : syncCodeStatus === "applied"
        ? t.sidepanel.syncConfigCodeApplied
        : syncCodeStatus === "error"
          ? t.sidepanel.syncConfigCodeInvalid
          : "";
  const setupFeedbackError =
    syncStatus === "error" || syncCodeStatus === "error";
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
                      setSyncCodeDraft={setSyncCodeDraft}
                      setSyncCodeStatus={setSyncCodeStatus}
                      applySyncConfigCode={applySyncConfigCode}
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

function hasCloudData(value: unknown) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object")
    return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function hasCloudValue(value: unknown) {
  return value !== undefined;
}

function hasCloudBootstrapData(cloudState: CloudBootstrapState) {
  return (
    hasCloudData(cloudState.language) ||
    hasCloudData(cloudState.preferences) ||
    Object.values(cloudState.data).some(hasCloudValue)
  );
}

async function readCloudBootstrapState(backend: SyncBackend) {
  const [language, preferences, ...dataValues] = await Promise.all([
    backend.read<string>(STORAGE_KEYS.language),
    backend.read<Preferences>(STORAGE_KEYS.preferences),
    ...BOOTSTRAP_CLOUD_DATA_KEYS.map((key) => backend.read(key)),
  ]);
  const data = Object.fromEntries(
    BOOTSTRAP_CLOUD_DATA_KEYS.map((key, index) => [key, dataValues[index]]),
  );
  return {
    language,
    preferences: preferences ? mergePreferences(preferences) : undefined,
    data,
  } satisfies CloudBootstrapState;
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
