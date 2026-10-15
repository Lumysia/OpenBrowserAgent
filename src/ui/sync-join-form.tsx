import { Cloud } from "lucide-react";
import { useState } from "react";
import type { Messages } from "../shared/i18n";
import {
  BROWSER_SYNC_BACKEND_ID,
  DEFAULT_SYNC_BACKENDS,
  SYNC_BACKEND_REGISTRY,
  WEBDAV_SYNC_BACKEND_ID,
  webDavBackendOf,
  withWebDavPatch,
} from "../shared/sync-backends";
import type { WebDavSyncBackendConfig } from "../shared/types";
import {
  Button,
  CardDescription,
  Disclosure,
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
} from "./components";
import { useMessages } from "./messages";
import { syncBackendTypeLabel } from "./sync-backend-display";
import { UI_STATE, stateWhen } from "./ui-state";
import { useSyncJoin, type SyncJoinPhase } from "./use-sync-join";
import { WebDavConnectionFields } from "./webdav-connection-fields";

type Mode = "code" | "manual";
type WebDavEdits = Partial<
  Pick<WebDavSyncBackendConfig, "url" | "username" | "password">
>;

const FEEDBACK = {
  invalid: "codeInvalid",
  testing: "testing",
  pulling: "pulling",
  failed: "failed",
  connected: "connected",
} as const satisfies Partial<Record<SyncJoinPhase, keyof Messages["setup"]>>;

const ACTION = {
  testing: "testing",
  pulling: "pulling",
} as const satisfies Partial<Record<SyncJoinPhase, keyof Messages["setup"]>>;

// Joins sync from another device: paste its sync code or (`manual`) type a
// backend's details. First-run setup offers both; the Sync page, where the
// backend choice is the manual way, only the code.
export function SyncJoinForm({ manual }: { manual?: boolean }) {
  const t = useMessages();
  const join = useSyncJoin();
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [backendId, setBackendId] = useState<string>(BROWSER_SYNC_BACKEND_ID);
  const [webDavEdits, setWebDavEdits] = useState<WebDavEdits>({});
  const webDav = webDavBackendOf(
    withWebDavPatch(DEFAULT_SYNC_BACKENDS, webDavEdits),
  );
  const ready =
    mode === "code"
      ? !!code.trim()
      : backendId !== WEBDAV_SYNC_BACKEND_ID || !!webDav.url;
  const feedbackKey = join.phase === "idle" ? undefined : FEEDBACK[join.phase];
  const error = join.phase === "invalid" || join.phase === "failed";
  const actionKey =
    join.phase === "testing" || join.phase === "pulling"
      ? ACTION[join.phase]
      : "connect";

  function submit() {
    if (mode === "code") return join.joinWithCode(code);
    join.joinWithBackend(
      backendId === WEBDAV_SYNC_BACKEND_ID
        ? webDav
        : DEFAULT_SYNC_BACKENDS.find((backend) => backend.id === backendId)!,
    );
  }

  const codeField = (
    <>
      <Label>
        {t.setup.code}
        <Textarea
          value={code}
          placeholder="oba-sync-v2…"
          disabled={join.busy}
          onChange={(event) => {
            setCode(event.target.value);
            join.reset();
          }}
        />
      </Label>
      <CardDescription>{t.setup.codeDescription}</CardDescription>
    </>
  );

  return (
    <div className="sync-join-form">
      {manual ? (
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList className="sync-join-tabs">
            <TabsTrigger value="code" disabled={join.busy}>
              {t.setup.codeTab}
            </TabsTrigger>
            <TabsTrigger value="manual" disabled={join.busy}>
              {t.setup.manualTab}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="code" className="sync-join-tab-panel">
            {codeField}
          </TabsContent>
          <TabsContent value="manual" className="sync-join-tab-panel">
            <Select
              value={backendId}
              onValueChange={(value) => {
                setBackendId(value);
                join.reset();
              }}
              disabled={join.busy}
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
            {backendId === WEBDAV_SYNC_BACKEND_ID && (
              <WebDavConnectionFields
                backend={{ ...webDav, ...webDavEdits }}
                disabled={join.busy}
                live
                onChange={(patch) => {
                  setWebDavEdits((edits) => ({ ...edits, ...patch }));
                  join.reset();
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        codeField
      )}
      {feedbackKey && (
        <Feedback
          key={feedbackKey}
          error={error}
          className="setup-feedback"
          data-state={stateWhen(error, UI_STATE.error)}
        >
          {t.setup[feedbackKey]}
        </Feedback>
      )}
      <div className="row">
        <Button
          className="setup-loading-action"
          data-state={stateWhen(join.busy, UI_STATE.loading)}
          onClick={submit}
          disabled={!ready || join.busy}
        >
          <Cloud className={join.busy ? "spin" : ""} size={16} />
          {t.setup[actionKey]}
        </Button>
      </div>
    </div>
  );
}

// First-run setup: joining sync is for people with another device, so it
// stays a link until asked for.
export function SyncJoinDisclosure() {
  const t = useMessages();
  return (
    <Disclosure label={t.setup.joinLink} triggerClassName="setup-join-link">
      <SyncJoinForm manual />
    </Disclosure>
  );
}
