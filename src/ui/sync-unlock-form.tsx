import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { SYNC_PASSPHRASE_MIN_LENGTH } from "../shared/config";
import { setSyncPassphrase } from "../shared/sync/client";
import { Button, Feedback, Input } from "./components";
import { useMessages } from "./messages";
import { useLatest } from "./use-latest";

// Enters the sync passphrase another device set, so synced API keys can be
// read here. A wrong one says so. `onSkip` leaves the keys locked for now.
export function SyncUnlockForm({
  onDone,
  onSkip,
  onBusyChange,
}: {
  onDone?: () => void;
  onSkip?: () => void;
  // Whether the passphrase is being checked.
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useMessages();
  const [passphrase, setPassphrase] = useState("");
  const [wrong, setWrong] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latestBusyChange = useLatest(onBusyChange);
  useEffect(() => latestBusyChange.current?.(busy), [busy, latestBusyChange]);

  async function submit() {
    // Shorter than any passphrase can be: it is not the one.
    if (passphrase.length < SYNC_PASSPHRASE_MIN_LENGTH) return setWrong(true);
    setBusy(true);
    setWrong(false);
    setError("");
    try {
      if ((await setSyncPassphrase(passphrase)) === "wrong") setWrong(true);
      else onDone?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="sync-unlock-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        type="password"
        autoComplete="current-password"
        aria-label={t.sync.passphrase}
        placeholder={t.sync.passphrase}
        value={passphrase}
        aria-invalid={wrong || undefined}
        onChange={(event) => {
          setPassphrase(event.target.value);
          setWrong(false);
        }}
      />
      <div className="row">
        <Button type="submit" size="sm" disabled={busy || !passphrase}>
          <KeyRound size={15} /> {t.setup.unlock}
        </Button>
        {onSkip && (
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            {t.setup.skip}
          </Button>
        )}
      </div>
      {(wrong || error) && (
        <Feedback error>{wrong ? t.sync.passphraseWrong : error}</Feedback>
      )}
    </form>
  );
}
