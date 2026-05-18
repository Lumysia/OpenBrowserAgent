import { Bot, Cloud } from "lucide-react";
import { useState, type ReactNode } from "react";
import { OPTIONS_HASH, QUICK_FEEDBACK_MS } from "../../src/shared/config";
import type { Messages } from "../../src/shared/i18n";
import { getSyncedProviderState, setDataSync } from "../../src/shared/storage";
import { completeLocalBootstrapState } from "../../src/shared/storage-debug";
import { openOrFocusOptions } from "../../src/shared/tab-navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../src/ui/components";

export function ProvidersEmptyState({ t }: { t: Messages }) {
  const [syncing, setSyncing] = useState(false);
  const [startingLocal, setStartingLocal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "success" | "empty" | "error"
  >("idle");

  async function syncProvidersFromCloud() {
    setSyncing(true);
    setSyncStatus("idle");
    try {
      const syncedProviders = await getSyncedProviderState();
      const syncedModelCount = Object.values(syncedProviders || {}).flatMap(
        (provider) => provider?.models || [],
      ).length;
      if (syncedModelCount === 0) {
        setSyncStatus("empty");
        return;
      }
      await completeLocalBootstrapState();
      await setDataSync("syncProviders", true);
      setSyncStatus("success");
    } catch (error) {
      console.warn("Failed to sync providers", error);
      setSyncStatus("error");
    } finally {
      setSyncing(false);
    }
  }

  async function startLocally() {
    if (startingLocal) return;
    setStartingLocal(true);
    window.setTimeout(() => setStartingLocal(false), QUICK_FEEDBACK_MS);
    openOrFocusOptions(OPTIONS_HASH.providers).catch(console.warn);
  }

  const syncMessage =
    syncStatus === "success"
      ? t.sidepanel.cloudSyncSuccess
      : syncStatus === "empty"
        ? t.sidepanel.cloudSyncEmpty
        : syncStatus === "error"
          ? t.sidepanel.cloudSyncError
          : t.sidepanel.cloudSyncDescription;

  return (
    <div className="sidepanel">
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
                title={t.sidepanel.bootstrapStepSyncTitle}
                description={syncMessage}
                active
              >
                <div className="bootstrap-actions">
                  <Button
                    onClick={syncProvidersFromCloud}
                    disabled={
                      syncing ||
                      syncStatus === "empty" ||
                      syncStatus === "success"
                    }
                  >
                    <Cloud size={16} />
                    {syncing
                      ? t.sidepanel.cloudSyncPulling
                      : t.sidepanel.cloudSync}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={startLocally}
                    disabled={startingLocal}
                  >
                    {t.sidepanel.startLocally}
                  </Button>
                </div>
              </BootstrapStep>
              <BootstrapStep
                number="2"
                title={t.sidepanel.bootstrapStepProviderTitle}
                description={t.sidepanel.bootstrapStepProviderDescription}
              />
              <BootstrapStep
                number="3"
                title={t.sidepanel.bootstrapStepTaskTitle}
                description={t.sidepanel.bootstrapStepTaskDescription}
              />
            </div>
          </CardContent>
        </Card>
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
      <div className="stack bootstrap-step-copy">
        <strong>{title}</strong>
        <CardDescription>{description}</CardDescription>
        {children}
      </div>
    </div>
  );
}
