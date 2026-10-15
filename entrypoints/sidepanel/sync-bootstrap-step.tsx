import { Cloud } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  SYNC_BACKEND_REGISTRY,
  WEBDAV_SYNC_BACKEND_ID,
} from "../../src/shared/sync-backends";
import type { WebDavSyncBackendConfig } from "../../src/shared/types";
import { syncBackendTypeLabel } from "../../src/ui/sync-backend-display";
import { WebDavConnectionFields } from "../../src/ui/webdav-connection-fields";
import {
  Button,
  CardDescription,
  Feedback,
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
import { cn } from "../../src/ui/utils";
import { useMessages } from "../../src/ui/messages";

type WebDavDraft = WebDavSyncBackendConfig;

export function SyncBootstrapStep({
  selectedBackendId,
  setSelectedBackendId,
  webDavDraft,
  updateWebDavBackend,
  syncSetupMode,
  setSyncSetupMode,
  syncCodeDraft,
  setSyncCodeDraft,
  setupFeedbackMessage,
  setupFeedbackError,
  syncing,
  hasActiveSyncBackend,
  canPull,
  cloudActionLabel,
  handleCloudAction,
}: {
  selectedBackendId: string;
  setSelectedBackendId: (backendId: string) => void;
  webDavDraft: WebDavDraft;
  updateWebDavBackend: (patch: Partial<WebDavDraft>) => void;
  syncSetupMode: "code" | "manual";
  setSyncSetupMode: Dispatch<SetStateAction<"code" | "manual">>;
  syncCodeDraft: string;
  setSyncCodeDraft: (value: string) => void;
  setupFeedbackMessage: string;
  setupFeedbackError: boolean;
  syncing: boolean;
  hasActiveSyncBackend: boolean;
  canPull: boolean;
  cloudActionLabel: string;
  handleCloudAction: () => void;
}) {
  const t = useMessages();
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
              onChange={(event) => setSyncCodeDraft(event.target.value)}
            />
          </Label>
          <CardDescription>
            {t.sidepanel.syncConfigCodeDescription}
          </CardDescription>
        </TabsContent>
        <TabsContent value="manual" className="bootstrap-sync-tab-panel">
          <ManualSyncBackendFields
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
        <Feedback
          key={setupFeedbackMessage}
          error={setupFeedbackError}
          className={cn(
            "bootstrap-feedback-card",
            setupFeedbackError && "is-error",
          )}
        >
          {setupFeedbackMessage}
        </Feedback>
      ) : null}
      <Button
        className={cn("bootstrap-cloud-action", syncing && "is-loading")}
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
  selectedBackendId,
  setSelectedBackendId,
  webDavDraft,
  updateWebDavBackend,
  syncing,
  hasActiveSyncBackend,
}: {
  selectedBackendId: string;
  setSelectedBackendId: (backendId: string) => void;
  webDavDraft: WebDavDraft;
  updateWebDavBackend: (patch: Partial<WebDavDraft>) => void;
  syncing: boolean;
  hasActiveSyncBackend: boolean;
}) {
  const t = useMessages();
  const disabled = syncing || hasActiveSyncBackend;
  return (
    <>
      <Select
        value={selectedBackendId}
        onValueChange={setSelectedBackendId}
        disabled={disabled}
      >
        <SelectTrigger>
          <Cloud size={16} />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SYNC_BACKEND_REGISTRY.map((backend) => (
            <SelectItem key={backend.id} value={backend.id}>
              {syncBackendTypeLabel(backend.type, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedBackendId === WEBDAV_SYNC_BACKEND_ID && (
        <div className="bootstrap-backend-fields">
          <WebDavConnectionFields
            backend={webDavDraft}
            disabled={disabled}
            live
            onChange={updateWebDavBackend}
          />
        </div>
      )}
    </>
  );
}
