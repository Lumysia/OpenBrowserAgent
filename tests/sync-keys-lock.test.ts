import assert from "node:assert/strict";
import { test } from "node:test";
import {
  providerKeyLocked,
  syncKeysLocked,
} from "../src/shared/sync-keys-lock";

test("synced keys are locked while the server has a passphrase this device lacks", () => {
  const locked = { keys: { onServer: true, unlocked: false } };
  assert.equal(syncKeysLocked(locked, true), true);
  // Sync off: the last status no longer applies.
  assert.equal(syncKeysLocked(locked, false), false);
  assert.equal(
    syncKeysLocked({ keys: { onServer: true, unlocked: true } }, true),
    false,
  );
  // No passphrase on the server: nothing to unlock.
  assert.equal(
    syncKeysLocked({ keys: { onServer: false, unlocked: false } }, true),
    false,
  );
  assert.equal(syncKeysLocked({}, true), false);
  assert.equal(syncKeysLocked(undefined, true), false);
});

test("a provider's key is locked only when it takes one and has none here", () => {
  assert.equal(providerKeyLocked({ type: "openai" }, true), true);
  assert.equal(
    providerKeyLocked({ type: "openai", apiKey: "sk" }, true),
    false,
  );
  // Local endpoints take no key.
  assert.equal(providerKeyLocked({ type: "ollama" }, true), false);
  assert.equal(providerKeyLocked({ type: "openai" }, false), false);
});
