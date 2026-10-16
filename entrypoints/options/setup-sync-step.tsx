import { Cloud, RotateCcw, Server, TicketCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  BROWSER_SYNC_BACKEND_ID,
  DEFAULT_SYNC_BACKENDS,
  SYNC_BACKEND_TYPES,
  webDavBackendOf,
} from "../../src/shared/sync-backends";
import {
  Button,
  Card,
  CardContent,
  ChoiceCard,
  ChoiceCards,
  Feedback,
} from "../../src/ui/components";
import { useLatest } from "../../src/ui/use-latest";
import { useMessages } from "../../src/ui/messages";
import { syncBackendHint } from "../../src/ui/sync-backend-display";
import {
  SyncCodeField,
  SyncJoinButton,
  SyncJoinFeedback,
  useWebDavEdits,
} from "../../src/ui/sync-join-form";
import { useSyncJoin } from "../../src/ui/use-sync-join";
import { WebDavConnectionFields } from "../../src/ui/webdav-connection-fields";
import { useSetupBusy, type SetupBusyReport } from "./use-setup-busy";

const METHODS = ["code", "browser", "webDav"] as const;
type Method = (typeof METHODS)[number];

const BROWSER_BACKEND = DEFAULT_SYNC_BACKENDS.find(
  (backend) => backend.id === BROWSER_SYNC_BACKEND_ID,
)!;

// Sync that didn't work out: what happened, and either trying again or
// going on as a first-time user.
export function SetupSyncFallback({
  message,
  onRetry,
  onNewUser,
}: {
  message?: ReactNode;
  onRetry: () => void;
  onNewUser: () => void;
}) {
  const s = useMessages().setup;
  return (
    <>
      {message}
      <div className="row">
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw size={15} /> {s.tryAgain}
        </Button>
        <Button variant="ghost" onClick={onNewUser}>
          {s.asNewUser}
        </Button>
      </div>
    </>
  );
}

// The returning path's first step: connect sync the way the other device
// does, with its sync code (recommended), the browser account, or a WebDAV
// server. Connecting tests the backend, makes it active and syncs once.
export function SetupSyncStep({
  connected: syncOn,
  onBusy,
  onConnected,
  onNewUser,
}: {
  // Sync is on already (setup came back here): connecting again is for
  // other details, and Next goes on.
  connected: boolean;
  onBusy: SetupBusyReport;
  onConnected: () => void;
  onNewUser: () => void;
}) {
  const t = useMessages();
  const s = t.setup;
  const join = useSyncJoin();
  const [method, setMethod] = useState<Method>("code");
  const [code, setCode] = useState("");
  const webDav = useWebDavEdits(webDavBackendOf(DEFAULT_SYNC_BACKENDS));
  const connected = join.phase === "connected";
  useSetupBusy(
    onBusy,
    join.phase === "testing" || join.phase === "pulling"
      ? s[join.phase]
      : undefined,
  );

  const latestConnected = useLatest(onConnected);
  useEffect(() => {
    if (connected) latestConnected.current();
  }, [connected, latestConnected]);

  const methods: Record<
    Method,
    {
      icon: ReactNode;
      title: string;
      description: string;
      ready: boolean;
      connect: () => void;
      fields?: ReactNode;
      action?: string;
    }
  > = {
    code: {
      icon: <TicketCheck size={18} />,
      title: s.methodCode,
      description: s.methodCodeDescription,
      ready: !!code.trim(),
      connect: () => join.joinWithCode(code),
      fields: (
        <SyncCodeField
          value={code}
          disabled={join.busy}
          onChange={(value) => {
            setCode(value);
            join.reset();
          }}
        />
      ),
    },
    browser: {
      icon: <Cloud size={18} />,
      title: s.methodBrowser,
      description: syncBackendHint(SYNC_BACKEND_TYPES.browserSync, t),
      ready: true,
      connect: () => join.joinWithBackend(BROWSER_BACKEND),
      action: s.browserConnect,
    },
    webDav: {
      icon: <Server size={18} />,
      title: t.sync.choiceWebDav,
      description: syncBackendHint(SYNC_BACKEND_TYPES.webDav, t),
      ready: !!webDav.draft.url,
      connect: () => join.joinWithBackend(webDav.draft),
      fields: (
        <WebDavConnectionFields
          backend={webDav.shown}
          disabled={join.busy}
          live
          onChange={(patch) => {
            webDav.edit(patch);
            join.reset();
          }}
        />
      ),
    },
  };
  const chosen = methods[method];

  return (
    <div className="stack">
      <ChoiceCards aria-label={s.syncTitle} className="setup-sync-methods">
        {METHODS.map((id) => (
          <ChoiceCard
            key={id}
            icon={methods[id].icon}
            title={methods[id].title}
            description={methods[id].description}
            badge={id === "code" ? s.recommended : undefined}
            selected={method === id}
            disabled={join.busy}
            onClick={() => {
              setMethod(id);
              join.reset();
            }}
          />
        ))}
      </ChoiceCards>
      <Card key={method}>
        <CardContent className="sync-join-form">
          {chosen.fields}
          {syncOn && join.phase === "idle" && (
            <Feedback className="setup-feedback">{s.connected}</Feedback>
          )}
          <SyncJoinFeedback
            phase={join.phase}
            failed={
              <SetupSyncFallback
                onRetry={chosen.connect}
                onNewUser={onNewUser}
              />
            }
          />
          {join.phase !== "failed" && (
            <SyncJoinButton
              join={join}
              ready={chosen.ready}
              onClick={chosen.connect}
              variant={syncOn ? "outline" : "default"}
            >
              {chosen.action}
            </SyncJoinButton>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
