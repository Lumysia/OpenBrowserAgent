import { base64ToBytes, bytesToBase64 } from "../binary";
import { STORAGE_KEYS, SYNC_GROUPS } from "../storage-keys";
import { bytesText, jsonBytes, toArrayBuffer } from "./codec";
import { recordIdOf, SYNC_COLLECTIONS, syncCollection } from "./collections";
import { readKey, type StorageArea } from "./env";
import type { Keyring, Root, SyncRecord } from "./root";

// End-to-end encryption of the keys group (API keys, MCP headers). The key
// is derived from the sync passphrase with PBKDF2-SHA256; records are sealed
// with AES-GCM under a random IV, bound to their id and clock. The server
// holds the salt and a sealed check text (the root's keyring), so a wrong
// passphrase is reported instead of saving garbage. Each device stores the
// derived key, so the passphrase is asked once per device.

export const PASSPHRASE_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const CHECK_TEXT = "openbrowseragent.sync.keys";

// The key this device derived, for the keyring it belongs to. While a
// passphrase change is not written yet, `previous` still reads the root.
export type LocalKeyring = {
  keyring: Keyring;
  key: string;
  previous?: { check: string; key: string };
};

export class WrongPassphraseError extends Error {}

const keyringKey = (scope: string) => `${STORAGE_KEYS.syncKeyring}:${scope}`;

export const loadLocalKeyring = (local: StorageArea, scope: string) =>
  readKey<LocalKeyring>(local, keyringKey(scope));

export const saveLocalKeyring = (
  local: StorageArea,
  scope: string,
  keyring: LocalKeyring,
) => local.set({ [keyringKey(scope)]: keyring });

export const removeLocalKeyring = (local: StorageArea, scope: string) =>
  local.remove(keyringKey(scope));

async function deriveKey(passphrase: string, salt: string, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(base64ToBytes(salt)),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return bytesToBase64(
    new Uint8Array(await crypto.subtle.exportKey("raw", key)),
  );
}

const importKey = (key: string) =>
  crypto.subtle.importKey(
    "raw",
    toArrayBuffer(base64ToBytes(key)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );

async function seal(key: CryptoKey, plain: Uint8Array, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(context),
      },
      key,
      toArrayBuffer(plain),
    ),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return bytesToBase64(out);
}

// Undefined when the key or the context does not fit (or it was changed).
async function unseal(key: CryptoKey, sealed: string, context: string) {
  try {
    const bytes = base64ToBytes(sealed);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes.slice(0, IV_BYTES),
          additionalData: new TextEncoder().encode(context),
        },
        key,
        toArrayBuffer(bytes.slice(IV_BYTES)),
      ),
    );
  } catch {
    return undefined;
  }
}

const CHECK_CONTEXT = "keyring";

// A new keyring for `passphrase`, with the key derived from it.
export async function createKeyring(
  passphrase: string,
  iterations = PASSPHRASE_ITERATIONS,
): Promise<{ keyring: Keyring; key: string }> {
  const salt = bytesToBase64(
    crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
  );
  const key = await deriveKey(passphrase, salt, iterations);
  const check = await seal(
    await importKey(key),
    new TextEncoder().encode(CHECK_TEXT),
    CHECK_CONTEXT,
  );
  return { keyring: { salt, iterations, check }, key };
}

// The key of `keyring` if `passphrase` is its passphrase.
export async function unlockKeyring(keyring: Keyring, passphrase: string) {
  const key = await deriveKey(passphrase, keyring.salt, keyring.iterations);
  const check = await unseal(
    await importKey(key),
    keyring.check,
    CHECK_CONTEXT,
  );
  if (!check || bytesText(check) !== CHECK_TEXT)
    throw new WrongPassphraseError("Wrong sync passphrase.");
  return key;
}

const ENCRYPTED_PREFIXES = SYNC_COLLECTIONS.filter(
  (collection) => collection.encrypted,
).map((collection) => `${collection.name}/`);

const isEncrypted = (recordId: string) =>
  ENCRYPTED_PREFIXES.some((prefix) => recordId.startsWith(prefix));

const sealContext = (recordId: string, record: SyncRecord) =>
  `${recordId}\n${record.clock}`;

// The keys a round reads and writes sealed records with.
export type RoundKeys = {
  // Reads the remote root's sealed records.
  open?: CryptoKey;
  // Seals the records the next root holds.
  seal?: CryptoKey;
  // The keyring the next root gets (a new passphrase).
  install?: Keyring;
  // Encrypted collections can be compared and written this round.
  unlocked: boolean;
};

export async function roundKeys(
  local: StorageArea,
  scope: string,
  remote: Keyring | undefined,
): Promise<RoundKeys> {
  const stored = await loadLocalKeyring(local, scope);
  if (!stored) return { unlocked: false };
  const key = await importKey(stored.key);
  if (!remote) return { seal: key, install: stored.keyring, unlocked: true };
  if (remote.check === stored.keyring.check) {
    if (stored.previous)
      await saveLocalKeyring(local, scope, { ...stored, previous: undefined });
    return { open: key, seal: key, unlocked: true };
  }
  if (stored.previous?.check === remote.check)
    return {
      open: await importKey(stored.previous.key),
      seal: key,
      install: stored.keyring,
      unlocked: true,
    };
  // The passphrase was changed on another device: it is asked again.
  await removeLocalKeyring(local, scope);
  return { unlocked: false };
}

// The root with its sealed records readable. Without the key they stay
// sealed (their collections are not compared); one that does not open with
// the key is left out, so the next write replaces it.
export async function openRoot(root: Root, keys: RoundKeys): Promise<Root> {
  if (!keys.unlocked) return root;
  const records = { ...root.records };
  for (const [recordId, record] of Object.entries(root.records)) {
    if (!isEncrypted(recordId) || record.sealed === undefined) continue;
    const plain = keys.open
      ? await unseal(keys.open, record.sealed, sealContext(recordId, record))
      : undefined;
    if (!plain) {
      delete records[recordId];
      continue;
    }
    const { sealed: _sealed, ...rest } = record;
    records[recordId] = { ...rest, data: JSON.parse(bytesText(plain)) };
  }
  return { ...root, records };
}

// Whether the root's own setting has the keys group on: a device that has
// not seen the switch turned on yet never removes the keys.
export function keysOn(root: Root) {
  const collection = syncCollection("sync-groups")!;
  const record = root.records[recordIdOf(collection, SYNC_GROUPS.keys)];
  return !!record && !record.deleted && record.data === true;
}

// The next root as stored: readable records of encrypted collections sealed
// (unchanged ones keep their ciphertext), the keyring installed; with the
// keys group off, no keyring and no keys at all. `changed`: it differs from
// `remote` in a way that needs a write even with nothing else to push.
export async function sealRoot(
  next: Root,
  remote: Root,
  keys: RoundKeys,
): Promise<{ root: Root; changed: boolean }> {
  const records = { ...next.records };
  if (!keysOn(next)) {
    let changed = !!next.keyring;
    for (const recordId of Object.keys(records))
      if (isEncrypted(recordId)) {
        delete records[recordId];
        changed = true;
      }
    const { keyring: _keyring, ...rest } = next;
    return { root: { ...rest, records }, changed };
  }
  for (const [recordId, record] of Object.entries(records)) {
    if (!isEncrypted(recordId) || record.deleted || !("data" in record))
      continue;
    const before = remote.records[recordId];
    const { data, ...rest } = record;
    const sealed =
      !keys.install && before?.clock === record.clock && before.sealed
        ? before.sealed
        : keys.seal &&
          (await seal(
            keys.seal,
            jsonBytes(data),
            sealContext(recordId, record),
          ));
    if (sealed) records[recordId] = { ...rest, sealed };
    else delete records[recordId];
  }
  const root = { ...next, records };
  if (keys.install) root.keyring = keys.install;
  return { root, changed: !!keys.install };
}
