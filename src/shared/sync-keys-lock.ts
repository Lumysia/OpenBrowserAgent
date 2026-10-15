import { providerType } from "./providers";
import type { SyncStatus } from "./sync/state";
import type { ProviderConfig } from "./types";

// Whether synced API keys wait for the sync passphrase on this device: sync
// is on and the server has keys sealed with a passphrase this device has no
// key for.
export function syncKeysLocked(
  status: Pick<SyncStatus, "keys"> | undefined,
  syncOn: boolean,
) {
  return syncOn && !!status?.keys?.onServer && !status.keys.unlocked;
}

// Whether a request to the provider would go without its key because the
// key is synced but locked: the provider takes a key, this device has none,
// and synced keys are locked.
export function providerKeyLocked(
  provider: Pick<ProviderConfig, "type" | "apiKey">,
  keysLocked: boolean,
) {
  return keysLocked && !providerType(provider.type).keyless && !provider.apiKey;
}
