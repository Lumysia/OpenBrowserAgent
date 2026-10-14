import { Activity, RefreshCw } from "lucide-react";
import { useState } from "react";
import { formatCount, type Messages } from "../../src/shared/i18n";
import { storage } from "../../src/shared/storage";
import { NO_SYNC_BACKEND_ID } from "../../src/shared/sync-backends";
import { resolveMassDelete, syncNow } from "../../src/shared/sync/client";
import { SYNC_NOTES, type SyncWarning } from "../../src/shared/sync/state";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Feedback,
  InfoTip,
} from "../../src/ui/components";
import { describeSyncStatus, formatTime } from "../../src/ui/sync-status";
import { useStoredState } from "../../src/ui/useStoredState";

// Last sync, pause with its reason, pending changes, server warnings and
// deletions waiting for the user's answer.
export function SyncStatusCard({ t }: { t: Messages }) {
  const [status] = useStoredState(storage.syncStatus);
  const [activeBackendId] = useStoredState(storage.activeSyncBackendId);
  const [busy, setBusy] = useState(false);
  const enabled = !!activeBackendId && activeBackendId !== NO_SYNC_BACKEND_ID;
  const { tone, label } = describeSyncStatus(t, status, enabled);
  const collectionLabels = syncCollectionLabels(t);

  function run(action: () => Promise<unknown>) {
    setBusy(true);
    action()
      .catch((error) => console.warn("Sync action failed", error))
      .finally(() => setBusy(false));
  }

  const details = [
    status?.lastSyncAt
      ? t.sync.lastSync.replace("{time}", formatTime(status.lastSyncAt))
      : "",
    status?.pausedUntil && status.pausedUntil > Date.now() && status.pauseStatus
      ? t.sync.pausedRateLimit.replace("{status}", String(status.pauseStatus))
      : "",
    status?.pendingCount && tone !== "pending"
      ? formatCount(t.sync.statePending, status.pendingCount)
      : "",
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="stack">
        <div className="sync-status-row">
          <div className="sync-status-summary">
            <CardTitle className="settings-section-title">
              <Activity size={18} /> {t.sync.statusTitle}
              <span className={`sync-status-dot ${tone}`} aria-hidden />
            </CardTitle>
            <CardDescription>{label}</CardDescription>
            {details.map((detail) => (
              <CardDescription key={detail}>{detail}</CardDescription>
            ))}
            {enabled && status?.error && (
              <Feedback error className="sync-status-error">
                {status.error}
              </Feedback>
            )}
          </div>
          {enabled && (
            <Button
              variant="outline"
              onClick={() => run(syncNow)}
              disabled={busy || status?.running}
            >
              <RefreshCw size={15} className={status?.running ? "spin" : ""} />
              {t.sync.syncNow}
            </Button>
          )}
        </div>
        {enabled &&
          status?.warnings.map((warning) => (
            <Feedback key={warning} error={!SYNC_NOTES.includes(warning)}>
              {t.sync.warnings[warning]}
              <WarningDetail t={t} warning={warning} />
            </Feedback>
          ))}
        {enabled &&
          [false, true].map((local) => {
            // Prompts already answered wait for the other kind's answer.
            const entries = (status?.massDelete ?? []).filter(
              (entry) => !!entry.local === local && entry.keep === undefined,
            );
            if (!entries.length) return null;
            const text = local
              ? {
                  title: t.sync.massDeleteLocalTitle,
                  description: t.sync.massDeleteLocalDescription,
                  apply: t.sync.massDeleteLocalApply,
                  keep: t.sync.massDeleteLocalKeep,
                }
              : {
                  title: t.sync.massDeleteTitle,
                  description: t.sync.massDeleteDescription,
                  apply: t.sync.massDeleteApply,
                  keep: t.sync.massDeleteKeep,
                };
            return (
              <div key={String(local)} className="stack sync-status-confirm">
                <CardTitle className="settings-section-title">
                  {text.title}
                </CardTitle>
                {entries.map((entry) => (
                  <CardDescription key={entry.collection}>
                    {text.description
                      .replace("{count}", String(entry.count))
                      .replace("{total}", String(entry.total))
                      .replace(
                        "{collection}",
                        collectionLabels[entry.collection] ?? entry.collection,
                      )}
                  </CardDescription>
                ))}
                <div className="sync-status-actions">
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => run(() => resolveMassDelete(true, local))}
                  >
                    {text.apply}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => resolveMassDelete(false, local))}
                  >
                    {text.keep}
                  </Button>
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

// Only some warnings have more to say than their one line.
function WarningDetail({ t, warning }: { t: Messages; warning: SyncWarning }) {
  const details: Partial<Record<SyncWarning, string>> = t.sync.warningDetails;
  const detail = details[warning];
  return detail ? <InfoTip label={t.common.moreInfo}>{detail}</InfoTip> : null;
}

function syncCollectionLabels(t: Messages): Record<string, string> {
  return {
    language: t.common.language,
    preferences: t.options.general,
    "sync-data": t.options.sync,
    providers: t.options.providers,
    agents: t.options.agents,
    workspaces: t.options.syncAgents,
    skills: t.options.skills,
    "skill-settings": t.options.skills,
    "mcp-servers": t.options.mcpServers,
    bridges: t.options.localExecutionBridges,
    chats: t.sidepanel.chatHistory,
    attachments: t.options.syncChatAttachments,
  };
}
