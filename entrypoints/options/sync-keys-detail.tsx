import { useState } from "react";
import { SYNC_PASSPHRASE_MIN_LENGTH } from "../../src/shared/config";
import { setSyncPassphrase } from "../../src/shared/sync/client";
import type { SyncStatus } from "../../src/shared/sync/state";
import {
  Button,
  CardDescription,
  Feedback,
  Input,
  Label,
} from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

type Mode = "create" | "change";

// The sync passphrase under the keys switch: set when turning keys on, or
// changed. The one another device set is entered at the top of the page
// (SyncUnlockCard).
export function SyncKeysDetail({
  on,
  keys,
  asking,
  onClose,
}: {
  on: boolean;
  keys: SyncStatus["keys"];
  // Keys are being turned on: the passphrase comes first.
  asking: boolean;
  onClose: () => void;
}) {
  const t = useMessages();
  const [changing, setChanging] = useState(false);
  // Keys are on but this device has no key and the server has none (the
  // cloud was cleared): a new one is set.
  const missingKey = on && !!keys && !keys.unlocked;
  const mode: Mode | undefined =
    keys?.onServer && !keys.unlocked
      ? undefined
      : changing
        ? "change"
        : asking || missingKey
          ? "create"
          : undefined;

  if (mode)
    return (
      <PassphraseForm
        key={mode}
        mode={mode}
        onDone={() => {
          setChanging(false);
          onClose();
        }}
        onCancel={
          missingKey
            ? undefined
            : () => {
                setChanging(false);
                onClose();
              }
        }
      />
    );
  if (!on || !keys?.unlocked) return null;
  return (
    <div className="stack">
      <CardDescription>{t.sync.keysUnlocked}</CardDescription>
      <div className="row">
        <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
          {t.sync.passphraseChange}
        </Button>
      </div>
    </div>
  );
}

function PassphraseForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: Mode;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useMessages();
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const description = {
    create: t.sync.passphraseCreate,
    change: t.sync.passphraseChangeDescription,
  }[mode];

  async function submit() {
    if (passphrase.length < SYNC_PASSPHRASE_MIN_LENGTH)
      return setError(
        t.sync.passphraseTooShort.replace(
          "{min}",
          String(SYNC_PASSPHRASE_MIN_LENGTH),
        ),
      );
    if (passphrase !== repeat) return setError(t.sync.passphraseMismatch);
    setBusy(true);
    setError("");
    try {
      const result = await setSyncPassphrase(passphrase);
      if (result === "wrong") setError(t.sync.passphraseWrong);
      else onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <CardDescription>{description}</CardDescription>
      <Label>
        {t.sync.passphrase}
        <Input
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </Label>
      <Label>
        {t.sync.passphraseRepeat}
        <Input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </Label>
      {error && <Feedback error>{error}</Feedback>}
      <div className="row">
        <Button type="submit" size="sm" disabled={busy || !passphrase}>
          {t.sync.passphraseSave}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
