import { Cloud } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Messages } from "../shared/i18n";
import { webDavBackendOf, withWebDavPatch } from "../shared/sync-backends";
import type { WebDavSyncBackendConfig } from "../shared/types";
import {
  Button,
  CardDescription,
  Disclosure,
  Feedback,
  Label,
  Textarea,
} from "./components";
import { useMessages } from "./messages";
import { SyncUnlockForm } from "./sync-unlock-form";
import { UI_STATE, stateWhen } from "./ui-state";
import { useSyncJoin, type SyncJoinPhase } from "./use-sync-join";
import { useSyncKeysLocked } from "./use-sync-keys-locked";

type SyncJoin = ReturnType<typeof useSyncJoin>;
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

// Where joining sync stands, in words; `failed` adds what to do then.
export function SyncJoinFeedback({
  phase,
  failed,
}: {
  phase: SyncJoinPhase;
  failed?: ReactNode;
}) {
  const t = useMessages();
  if (phase === "idle") return null;
  const error = phase === "invalid" || phase === "failed";
  return (
    <>
      <Feedback
        key={phase}
        error={error}
        className="setup-feedback"
        data-state={stateWhen(error, UI_STATE.error)}
      >
        {t.setup[FEEDBACK[phase]]}
      </Feedback>
      {phase === "failed" && failed}
    </>
  );
}

// Connects with what was filled in; says what it is doing meanwhile.
export function SyncJoinButton({
  join,
  ready,
  onClick,
  children,
}: {
  join: SyncJoin;
  ready: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  const t = useMessages();
  const actionKey =
    join.phase === "testing" || join.phase === "pulling"
      ? ACTION[join.phase]
      : undefined;
  return (
    <div className="row">
      <Button
        className="setup-loading-action"
        data-state={stateWhen(join.busy, UI_STATE.loading)}
        onClick={onClick}
        disabled={!ready || join.busy}
      >
        <Cloud className={join.busy ? "spin" : ""} size={16} />
        {actionKey ? t.setup[actionKey] : (children ?? t.setup.connect)}
      </Button>
    </div>
  );
}

// The sync code another device copied, and where to find it there.
export function SyncCodeField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const t = useMessages();
  return (
    <>
      <Label>
        {t.setup.code}
        <Textarea
          value={value}
          placeholder="oba-sync-v2…"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </Label>
      <CardDescription>
        {t.setup.codeDescription
          .replace("{settings}", t.common.settings)
          .replace("{sync}", t.options.sync)
          .replace("{button}", t.sync.copyCode)}
      </CardDescription>
    </>
  );
}

// A WebDAV server's details as typed, before they are used: `shown` for
// the fields, `draft` the backend to connect to.
export function useWebDavEdits(backend: WebDavSyncBackendConfig) {
  const [edits, setEdits] = useState<WebDavEdits>({});
  return {
    shown: { ...webDavBackendOf(withWebDavPatch([backend], edits)), ...edits },
    draft: webDavBackendOf(withWebDavPatch([backend], edits)),
    edit: (patch: WebDavEdits) =>
      setEdits((current) => ({ ...current, ...patch })),
  };
}

// Joins sync from another device with its sync code. Right after
// connecting, synced API keys this device can't read yet ask for the sync
// passphrase: without it, chats with synced providers fail.
export function SyncJoinForm() {
  const t = useMessages();
  const join = useSyncJoin();
  const [code, setCode] = useState("");
  const keysLocked = useSyncKeysLocked();
  const [passphraseDone, setPassphraseDone] = useState(false);

  if (join.phase === "connected" && keysLocked && !passphraseDone)
    return (
      <div className="sync-join-form">
        <Feedback className="setup-feedback">{t.setup.keysLocked}</Feedback>
        <SyncUnlockForm
          onDone={() => setPassphraseDone(true)}
          onSkip={() => setPassphraseDone(true)}
        />
      </div>
    );

  return (
    <div className="sync-join-form">
      <SyncCodeField
        value={code}
        disabled={join.busy}
        onChange={(value) => {
          setCode(value);
          join.reset();
        }}
      />
      <SyncJoinFeedback phase={join.phase} />
      <SyncJoinButton
        join={join}
        ready={!!code.trim()}
        onClick={() => join.joinWithCode(code)}
      />
    </div>
  );
}

// Joining sync with a code is for people with another device, so it stays
// a link until asked for.
export function SyncJoinDisclosure() {
  const t = useMessages();
  return (
    <Disclosure label={t.sync.pasteCode}>
      <SyncJoinForm />
    </Disclosure>
  );
}
