import { Bot, Languages, Settings } from "lucide-react";
import { useMessages } from "../../src/ui/messages";
import { useState, type ReactNode } from "react";
import { LOCAL_SETUP_FEEDBACK_MS, OPTIONS_HASH } from "../../src/shared/config";
import { storage } from "../../src/shared/storage";
import { completeLocalBootstrapState } from "../../src/shared/storage-debug";
import type { SyncGroupSettings } from "../../src/shared/storage-keys";
import { parseSyncConfigCode } from "../../src/shared/sync-config-code";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  WEBDAV_SYNC_BACKEND_ID,
  webDavBackendOf,
  withWebDavPatch,
} from "../../src/shared/sync-backends";
import { checkSyncBackend, syncNow } from "../../src/shared/sync/client";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import type {
  SyncBackendConfig,
  WebDavSyncBackendConfig,
} from "../../src/shared/types";
import { resolveLanguage, UI_LANGUAGES } from "../../src/shared/ui-languages";
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
import { useTransient } from "../../src/ui/use-transient";
import { cn } from "../../src/ui/utils";
import { UI_STATE, stateWhen } from "../../src/ui/ui-state";
import {
  describeSetupState,
  type SetupAction,
  type SetupStatus,
} from "./setup-state";
import { SyncBootstrapStep } from "./sync-bootstrap-step";

export function ProvidersEmptyState() {
  const t = useMessages();
  const [language, setLanguage] = useStoredState(storage.language);
  const [syncBackends] = useStoredState(storage.syncBackends);
  const [syncGroups] = useStoredState(storage.syncGroups);
  const [activeSyncBackendId] = useStoredState(storage.activeSyncBackendId);
  const [chosenBackendId, setChosenBackendId] = useState<string>(
    BROWSER_SYNC_BACKEND_ID,
  );
  const [webDavEdits, setWebDavEdits] = useState<
    Partial<Pick<WebDavSyncBackendConfig, "url" | "username" | "password">>
  >({});
  const [syncSetupMode, setSyncSetupMode] = useState<"code" | "manual">("code");
  const [syncCodeDraft, setSyncCodeDraft] = useState("");
  const [syncCodeInvalid, setSyncCodeInvalid] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAction, setSyncAction] = useState<SetupAction>("test");
  const [syncFailed, setSyncFailed] = useState(false);
  const [startingLocal, showStartingLocal] = useTransient<true>(
    LOCAL_SETUP_FEEDBACK_MS,
  );

  if (!language || !syncBackends || !syncGroups || !activeSyncBackendId)
    return null;
  const loadedSyncBackends = syncBackends;
  const hasActiveSyncBackend = activeSyncBackendId !== NO_SYNC_BACKEND_ID;
  const syncStatus: SetupStatus = syncFailed
    ? "error"
    : hasActiveSyncBackend
      ? "synced"
      : "idle";
  const selectedBackendId = hasActiveSyncBackend
    ? activeSyncBackendId
    : chosenBackendId;
  // The WebDAV fields as typed; the backend made from them is trimmed.
  const draftBackends = withWebDavPatch(loadedSyncBackends, webDavEdits);
  const webDavDraft = webDavBackendOf(draftBackends);
  const canPull =
    syncSetupMode === "code"
      ? !!syncCodeDraft.trim()
      : selectedBackendId !== WEBDAV_SYNC_BACKEND_ID || !!webDavDraft.url;

  function updateWebDavBackend(patch: typeof webDavEdits) {
    if (hasActiveSyncBackend) return;
    setWebDavEdits((edits) => ({ ...edits, ...patch }));
    setSyncFailed(false);
  }

  function selectedBackendConfig(): SyncBackendConfig {
    return (
      draftBackends.find((backend) => backend.id === selectedBackendId) ||
      draftBackends[0]
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
    codeSettings?: SyncGroupSettings;
  }) {
    setSyncing(true);
    setSyncAction("test");
    setSyncFailed(false);
    try {
      await checkSyncBackend(backend);
      setSyncAction("confirm");
      await storage.syncBackends.set(backends);
      // The setup code's settings replace this device's on purpose.
      if (codeSettings) await storage.syncGroups.replace(codeSettings);
      await storage.activeSyncBackendId.set(backend.id);
      const status = await syncNow();
      if (status.error) throw new Error(status.error);
      await completeLocalBootstrapState();
    } catch (error) {
      console.warn("Failed to connect sync backend", error);
      setSyncFailed(true);
    } finally {
      setSyncing(false);
    }
  }

  function handleCloudAction() {
    if (hasActiveSyncBackend) return;
    if (syncSetupMode === "manual") {
      void connectCloud({
        backend: selectedBackendConfig(),
        backends: draftBackends,
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
    const { backend, syncGroups: codeSettings } = parsed;
    setChosenBackendId(backend.id);
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

  function startLocally() {
    if (startingLocal) return;
    showStartingLocal(true);
    openOrFocusOptions(OPTIONS_HASH.providers).catch(console.warn);
  }

  const setup = describeSetupState(t, {
    status: syncStatus,
    running: syncing ? syncAction : undefined,
    codeInvalid: syncCodeInvalid,
  });

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
                    title={t.common.language}
                    description={t.options.languageDescription}
                    active
                  >
                    <div className="bootstrap-actions">
                      <Select
                        value={resolveLanguage(language)}
                        onValueChange={setLanguage}
                      >
                        <SelectTrigger>
                          <Languages size={16} />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UI_LANGUAGES.map(({ code: id, label }) => (
                            <SelectItem key={id} value={id}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </BootstrapStep>
                  <BootstrapStep
                    title={t.sidepanel.bootstrapStepSyncTitle}
                    description={t.sidepanel.cloudSyncDescription}
                    active
                  >
                    <SyncBootstrapStep
                      selectedBackendId={selectedBackendId}
                      setSelectedBackendId={(backendId) => {
                        setChosenBackendId(backendId);
                        setSyncFailed(false);
                      }}
                      webDavDraft={{ ...webDavDraft, ...webDavEdits }}
                      updateWebDavBackend={updateWebDavBackend}
                      syncSetupMode={syncSetupMode}
                      setSyncSetupMode={setSyncSetupMode}
                      syncCodeDraft={syncCodeDraft}
                      setSyncCodeDraft={(value) => {
                        setSyncCodeDraft(value);
                        setSyncCodeInvalid(false);
                        setSyncFailed(false);
                      }}
                      setupFeedbackMessage={setup.feedback}
                      setupFeedbackError={setup.feedbackError}
                      syncing={syncing}
                      hasActiveSyncBackend={hasActiveSyncBackend}
                      canPull={canPull}
                      cloudActionLabel={setup.actionLabel}
                      handleCloudAction={handleCloudAction}
                    />
                  </BootstrapStep>
                  <BootstrapStep
                    title={t.sidepanel.bootstrapStepProviderTitle}
                    description={t.sidepanel.bootstrapStepProviderDescription}
                  >
                    <div className="bootstrap-actions">
                      <Button
                        variant="secondary"
                        onClick={startLocally}
                        disabled={!!startingLocal}
                      >
                        <Settings size={16} />
                        <span
                          key={setup.startLabel}
                          className="bootstrap-action-label"
                        >
                          {setup.startLabel}
                        </span>
                      </Button>
                      <CardDescription
                        aria-hidden={!startingLocal}
                        className="bootstrap-feedback-card local-setup-hint"
                        data-state={stateWhen(startingLocal, UI_STATE.visible)}
                      >
                        {t.sidepanel.localSetupHint}
                      </CardDescription>
                    </div>
                  </BootstrapStep>
                  <BootstrapStep
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

// Steps are numbered by CSS (a counter on .bootstrap-steps).
function BootstrapStep({
  title,
  description,
  active,
  children,
}: {
  title: string;
  description: string;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="bootstrap-step">
      <Badge
        className={cn(
          "bootstrap-step-number",
          !active && "bootstrap-step-muted",
        )}
      />
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
