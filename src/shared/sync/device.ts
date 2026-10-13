import { CLOCK_LOCK } from "../locks";
import { STORAGE_KEYS } from "../storage-keys";
import { readKey, type SyncEnv } from "./env";

// This install's sync device id, which stamps its clocks. It lives in local
// storage, so a copied browser profile or a backup restored on another
// computer carries it along: a round that finds a clock of this id this
// install never made gives it a new one.

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

const storedId = async (env: SyncEnv) => {
  const stored = await readKey<string>(env.local, STORAGE_KEYS.syncDeviceId);
  return stored && VALID_ID.test(stored) ? stored : undefined;
};

export async function loadDeviceId(env: SyncEnv) {
  return (
    (await storedId(env)) ??
    env.lock(CLOCK_LOCK, async () => (await storedId(env)) ?? newDeviceId(env))
  );
}

export function rotateDeviceId(env: SyncEnv) {
  return env.lock(CLOCK_LOCK, () => newDeviceId(env));
}

async function newDeviceId(env: SyncEnv) {
  const id = crypto.randomUUID();
  await env.local.set({ [STORAGE_KEYS.syncDeviceId]: id });
  return id;
}
