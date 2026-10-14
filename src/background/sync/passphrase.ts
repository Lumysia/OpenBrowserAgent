import { SYNC_PASSPHRASE_MIN_LENGTH } from "../../shared/config";
import { SYNC_LOCK } from "../../shared/locks";
import type { PassphraseResult } from "../../shared/sync/client";
import type { SyncContext } from "../../shared/sync/engine";
import {
  createKeyring,
  loadLocalKeyring,
  saveLocalKeyring,
  unlockKeyring,
  WrongPassphraseError,
} from "../../shared/sync/keys";
import type { Keyring } from "../../shared/sync/root";

// Sets the sync passphrase on this device. With a passphrase on the server
// that this device has no key for, it must be that one; otherwise (none
// yet, or a change on a device that has the key) a new keyring is made,
// which the next round writes and seals the keys with. Turns key sync on.
export async function setPassphrase(
  context: SyncContext,
  passphrase: string,
  turnOn: () => Promise<unknown>,
): Promise<PassphraseResult> {
  if (passphrase.length < SYNC_PASSPHRASE_MIN_LENGTH)
    throw new Error("The sync passphrase is too short.");
  const { env, scope, transport } = context;
  const result = await env.lock(SYNC_LOCK, async () => {
    const read = await transport.readRoot();
    const remote: Keyring | undefined =
      read.status === "ok"
        ? read.root.keyring
        : read.status === "damaged"
          ? read.previous?.keyring
          : undefined;
    const stored = await loadLocalKeyring(env.local, scope);
    if (remote && stored?.keyring.check !== remote.check) {
      try {
        const key = await unlockKeyring(remote, passphrase);
        await saveLocalKeyring(env.local, scope, { keyring: remote, key });
        return "set";
      } catch (error) {
        if (error instanceof WrongPassphraseError) return "wrong";
        throw error;
      }
    }
    const created = await createKeyring(passphrase);
    await saveLocalKeyring(env.local, scope, {
      ...created,
      ...(remote && stored
        ? { previous: { check: remote.check, key: stored.key } }
        : {}),
    });
    return "set";
  });
  if (result === "set") await turnOn();
  return result;
}
