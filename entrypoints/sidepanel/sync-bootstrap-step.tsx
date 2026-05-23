import { Cloud, KeyRound } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  BROWSER_SYNC_BACKEND_ID,
  SYNC_BACKEND_REGISTRY,
  WEBDAV_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backend-registry";
import type { SyncBackendConfig } from "../../src/shared/types";
import {
  Button,
  CardDescription,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "../../src/ui/components";

type WebDavDraft = Extract<SyncBackendConfig, { type: "webdav" }>;

export function SyncBootstrapStep({
  t,
  selectedBackendId,
  setSelectedBackendId,
  webDavDraft,
  updateWebDavBackend,
  syncSetupMode,
  setSyncSetupMode,
  syncCodeDraft,
  setSyncCodeDraft,
  setSyncCodeStatus,
  applySyncConfigCode,
  setupFeedbackMessage,
  setupFeedbackError,
  syncing,
  hasActiveSyncBackend,
  canPull,
  cloudActionLabel,
  handleCloudAction,
}: {
  t: Messages;
  selectedBackendId: string;
  setSelectedBackendId: (backendId: string) => void;
  webDavDraft: WebDavDraft;
  updateWebDavBackend: (patch: Partial<WebDavDraft>) => void;
  syncSetupMode: "code" | "manual";
  setSyncSetupMode: Dispatch<SetStateAction<"code" | "manual">>;
  syncCodeDraft: string;
  setSyncCodeDraft: Dispatch<SetStateAction<string>>;
  setSyncCodeStatus: Dispatch<SetStateAction<"idle" | "applied" | "error">>;
  applySyncConfigCode: () => void;
  setupFeedbackMessage: string;
  setupFeedbackError: boolean;
  syncing: boolean;
  hasActiveSyncBackend: boolean;
  canPull: boolean;
  cloudActionLabel: string;
  handleCloudAction: () => void;
}) {
  return (
    <div className="bootstrap-actions">
      <Tabs
        value={syncSetupMode}
        onValueChange={(value) => setSyncSetupMode(value as "code" | "manual")}
      >
        <TabsList className="bootstrap-sync-tabs">
          <TabsTrigger value="code" disabled={hasActiveSyncBackend}>
            {t.sidepanel.syncConfigCodeTab}
          </TabsTrigger>
          <TabsTrigger value="manual" disabled={hasActiveSyncBackend}>
            {t.sidepanel.syncManualTab}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="bootstrap-sync-tab-panel">
          <Label>
            {t.sidepanel.syncConfigCode}
            <Textarea
              value={syncCodeDraft}
              placeholder="oba-sync-v1..."
              disabled={syncing || hasActiveSyncBackend}
              onChange={(event) => {
                setSyncCodeDraft(event.target.value);
                setSyncCodeStatus("idle");
              }}
            />
          </Label>
          <CardDescription>
            {t.sidepanel.syncConfigCodeDescription}
          </CardDescription>
          <Button
            variant="secondary"
            onClick={applySyncConfigCode}
            disabled={!syncCodeDraft.trim() || syncing || hasActiveSyncBackend}
          >
            <KeyRound size={16} />
            {t.sidepanel.syncConfigCodeApply}
          </Button>
        </TabsContent>
        <TabsContent value="manual" className="bootstrap-sync-tab-panel">
          <ManualSyncBackendFields
            t={t}
            selectedBackendId={selectedBackendId}
            setSelectedBackendId={setSelectedBackendId}
            webDavDraft={webDavDraft}
            updateWebDavBackend={updateWebDavBackend}
            syncing={syncing}
            hasActiveSyncBackend={hasActiveSyncBackend}
          />
        </TabsContent>
      </Tabs>
      {setupFeedbackMessage ? (
        <CardDescription
          key={setupFeedbackMessage}
          className={`bootstrap-feedback-card ${setupFeedbackError ? "is-error" : ""}`}
        >
          {setupFeedbackMessage}
        </CardDescription>
      ) : null}
      <Button
        className={`ui-button-soft-accent bootstrap-cloud-action ${syncing ? "is-loading" : ""}`}
        onClick={handleCloudAction}
        disabled={!canPull || syncing || hasActiveSyncBackend}
      >
        <Cloud className={syncing ? "spin" : ""} size={16} />
        <span key={cloudActionLabel} className="bootstrap-action-label">
          {cloudActionLabel}
        </span>
      </Button>
    </div>
  );
}

function ManualSyncBackendFields({
  t,
  selectedBackendId,
  setSelectedBackendId,
  webDavDraft,
  updateWebDavBackend,
  syncing,
  hasActiveSyncBackend,
}: {
  t: Messages;
  selectedBackendId: string;
  setSelectedBackendId: (backendId: string) => void;
  webDavDraft: WebDavDraft;
  updateWebDavBackend: (patch: Partial<WebDavDraft>) => void;
  syncing: boolean;
  hasActiveSyncBackend: boolean;
}) {
  const webDavInactive = selectedBackendId !== WEBDAV_SYNC_BACKEND_ID;
  return (
    <>
      <Select
        value={selectedBackendId}
        onValueChange={setSelectedBackendId}
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
      {!webDavInactive ? (
        <div className="bootstrap-backend-fields is-visible">
          <Label>
            {t.options.syncBackendWebDavUrl}
            <Input
              value={webDavDraft.url}
              placeholder="https://example.com/dav/"
              disabled={syncing || hasActiveSyncBackend}
              onChange={(event) =>
                updateWebDavBackend({ url: event.target.value })
              }
            />
          </Label>
          <Label>
            {t.options.syncBackendUsername}
            <Input
              value={webDavDraft.username || ""}
              disabled={syncing || hasActiveSyncBackend}
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
              disabled={syncing || hasActiveSyncBackend}
              onChange={(event) =>
                updateWebDavBackend({ password: event.target.value })
              }
            />
          </Label>
        </div>
      ) : null}
    </>
  );
}
