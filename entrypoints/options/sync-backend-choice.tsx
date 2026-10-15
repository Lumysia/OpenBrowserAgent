import { Cloud, FolderSync } from "lucide-react";
import { useEffect, useState } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  BROWSER_SYNC_BACKEND_ID,
  NO_SYNC_BACKEND_ID,
  WEBDAV_SYNC_BACKEND_ID,
  webDavBackendOf,
  withWebDavPatch,
} from "../../src/shared/sync-backends";
import type {
  SyncBackendConfig,
  WebDavSyncBackendConfig,
} from "../../src/shared/types";
import {
  Button,
  CardDescription,
  Feedback,
  SettingsSection,
  ToggleGroup,
  ToggleGroupItem,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";
import { syncBackendHint } from "../../src/ui/sync-backend-display";
import { SyncJoinDisclosure } from "../../src/ui/sync-join-form";
import { UI_STATE, stateWhen } from "../../src/ui/ui-state";
import { useSyncJoin } from "../../src/ui/use-sync-join";
import { WebDavConnectionFields } from "../../src/ui/webdav-connection-fields";

const CHOICES = [
  NO_SYNC_BACKEND_ID,
  BROWSER_SYNC_BACKEND_ID,
  WEBDAV_SYNC_BACKEND_ID,
] as const;
type Choice = (typeof CHOICES)[number];

const CHOICE_LABEL = {
  [NO_SYNC_BACKEND_ID]: "choiceOff",
  [BROWSER_SYNC_BACKEND_ID]: "choiceBrowser",
  [WEBDAV_SYNC_BACKEND_ID]: "choiceWebDav",
} as const satisfies Record<Choice, keyof Messages["sync"]>;

const asChoice = (id: string): Choice =>
  (CHOICES as readonly string[]).includes(id)
    ? (id as Choice)
    : NO_SYNC_BACKEND_ID;

// Where this device syncs: off, the browser account, or a WebDAV server.
// Browser account sync starts at once; WebDAV starts once its server is
// filled in and answers. A sync code from another device sets both.
export function SyncBackendChoice({
  activeBackendId,
  backends,
  onActiveBackendChange,
  onBackendsChange,
}: {
  activeBackendId: string;
  backends: SyncBackendConfig[];
  onActiveBackendChange: (backendId: string) => void;
  onBackendsChange: (backends: SyncBackendConfig[]) => void;
}) {
  const t = useMessages();
  const active = asChoice(activeBackendId);
  // WebDAV can be chosen before its server is set up; it is active once
  // connected.
  const [choice, setChoice] = useState<Choice>(active);
  const webDav = webDavBackendOf(backends);

  useEffect(() => setChoice(active), [active]);

  function choose(value: string) {
    if (!value) return;
    const next = asChoice(value);
    setChoice(next);
    if (next !== WEBDAV_SYNC_BACKEND_ID || webDav.url)
      onActiveBackendChange(next);
  }

  return (
    <SettingsSection
      icon={<Cloud />}
      title={t.sync.choiceTitle}
      contentClassName="stack"
    >
      <ToggleGroup
        type="single"
        value={choice}
        onValueChange={choose}
        aria-label={t.sync.choiceTitle}
      >
        {CHOICES.map((id) => (
          <ToggleGroupItem key={id} value={id}>
            {t.sync[CHOICE_LABEL[id]]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <CardDescription key={choice}>
        {choice === NO_SYNC_BACKEND_ID
          ? t.sync.choiceOffHint
          : syncBackendHint(choice, t)}
      </CardDescription>
      {choice === WEBDAV_SYNC_BACKEND_ID &&
        (active === WEBDAV_SYNC_BACKEND_ID ? (
          <WebDavConnectionFields
            backend={webDav}
            onChange={(patch) =>
              onBackendsChange(withWebDavPatch(backends, patch))
            }
          />
        ) : (
          <WebDavConnect backend={webDav} />
        ))}
      <SyncJoinDisclosure label={t.sync.pasteCode} manual={false} />
    </SettingsSection>
  );
}

// The WebDAV server's details before it is used: tested and synced in one
// step, as when joining from setup.
function WebDavConnect({ backend }: { backend: WebDavSyncBackendConfig }) {
  const t = useMessages();
  const join = useSyncJoin();
  const [edits, setEdits] = useState<
    Partial<Pick<WebDavSyncBackendConfig, "url" | "username" | "password">>
  >({});
  const draft = webDavBackendOf(withWebDavPatch([backend], edits));
  const failed = join.phase === "failed";
  return (
    <>
      <WebDavConnectionFields
        backend={{ ...draft, ...edits }}
        disabled={join.busy}
        live
        onChange={(patch) => {
          setEdits((current) => ({ ...current, ...patch }));
          join.reset();
        }}
      />
      {(failed || join.busy) && (
        <Feedback error={failed} className="setup-feedback">
          {
            t.setup[
              join.phase === "pulling"
                ? "pulling"
                : failed
                  ? "failed"
                  : "testing"
            ]
          }
        </Feedback>
      )}
      <div className="row">
        <Button
          className="setup-loading-action"
          data-state={stateWhen(join.busy, UI_STATE.loading)}
          disabled={!draft.url || join.busy}
          onClick={() => join.joinWithBackend(draft)}
        >
          <FolderSync size={16} /> {t.setup.connect}
        </Button>
      </div>
    </>
  );
}
