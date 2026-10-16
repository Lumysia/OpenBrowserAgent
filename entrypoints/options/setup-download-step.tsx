import {
  Bot,
  Loader2,
  MessagesSquare,
  Server,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatCount } from "../../src/shared/i18n";
import {
  syncBroughtNoProvider,
  syncedDataCounts,
  type SyncedDataKind,
} from "../../src/shared/setup-summary";
import { storage } from "../../src/shared/storage";
import { syncNow } from "../../src/shared/sync/client";
import { Card, CardContent, Feedback } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { UI_STATE } from "../../src/ui/ui-state";
import { useStoredState } from "../../src/ui/useStoredState";
import { SetupSyncFallback } from "./setup-sync-step";

const KIND_ICON: Record<SyncedDataKind, LucideIcon> = {
  providers: Server,
  agents: Bot,
  skills: Sparkles,
  mcpServers: Wrench,
  chats: MessagesSquare,
};

type Phase = "downloading" | "failed" | "done";

// The returning path's download step: one more sync round (it brings the
// API keys once the passphrase is in), then what is here now, by kind.
// A failed round, or no AI provider, offers trying again or going on as a
// first-time user.
export function SetupDownloadStep({ onNewUser }: { onNewUser: () => void }) {
  const t = useMessages();
  const s = t.setup;
  const [phase, setPhase] = useState<Phase>("downloading");
  const [round, setRound] = useState(0);
  const [providers] = useStoredState(storage.provider);
  const [agents] = useStoredState(storage.agents);
  const [skills] = useStoredState(storage.skills);
  const [mcpServers] = useStoredState(storage.mcpServers);
  const [chats] = useStoredState(storage.chats);

  useEffect(() => {
    let active = true;
    setPhase("downloading");
    syncNow()
      .then((status) => status.error && Promise.reject(status.error))
      .then(
        () => active && setPhase("done"),
        (error) => {
          console.warn("Setup sync round failed", error);
          if (active) setPhase("failed");
        },
      );
    return () => {
      active = false;
    };
  }, [round]);

  const retry = () => setRound((current) => current + 1);
  const data = { providers, agents, skills, mcpServers, chats };

  if (phase === "downloading" || Object.values(data).includes(undefined))
    return (
      <Feedback className="setup-feedback setup-downloading">
        <Loader2 size={15} className="spin" /> {s.downloading}
      </Feedback>
    );
  if (phase === "failed")
    return (
      <SetupSyncFallback
        message={
          <Feedback
            error
            className="setup-feedback"
            data-state={UI_STATE.error}
          >
            {s.downloadFailed}
          </Feedback>
        }
        onRetry={retry}
        onNewUser={onNewUser}
      />
    );
  const counts = syncedDataCounts(data);
  return (
    <div className="stack">
      {counts.length > 0 && (
        <Card>
          <CardContent className="stack">
            <strong>{s.arrived}</strong>
            <ul className="setup-arrived">
              {counts.map(({ kind, count }) => {
                const Icon = KIND_ICON[kind];
                return (
                  <li key={kind} data-kind={kind}>
                    <Icon size={16} aria-hidden />
                    {formatCount(s.arrivedCount[kind], count)}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      {syncBroughtNoProvider(data) && (
        <SetupSyncFallback
          message={
            <Feedback
              error
              className="setup-feedback"
              data-state={UI_STATE.error}
            >
              {s.noSyncedProvider}
            </Feedback>
          }
          onRetry={retry}
          onNewUser={onNewUser}
        />
      )}
    </div>
  );
}
