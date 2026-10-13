import assert from "node:assert/strict";
import test from "node:test";
import { getMessages } from "../src/shared/i18n";
import { SYNC_WARNINGS, type SyncStatus } from "../src/shared/sync/state";
import { describeSyncStatus } from "../src/ui/sync-status";

const t = getMessages("en-US");
const base = { warnings: [], lastSyncAt: 1 } as unknown as SyncStatus;

test("notes that sync handles on its own read as synced, not as a problem", () => {
  const status = {
    ...base,
    warnings: [SYNC_WARNINGS.ignoresPreconditions, SYNC_WARNINGS.clonedDevice],
  };
  assert.equal(describeSyncStatus(t, status, true).tone, "synced");
});

test("warnings that need the user ask for attention, not an error", () => {
  const status = { ...base, warnings: [SYNC_WARNINGS.quota] };
  assert.equal(describeSyncStatus(t, status, true).tone, "attention");
  const prompt = {
    ...base,
    massDelete: [{ collection: "chats", count: 9, total: 10 }],
  };
  assert.equal(describeSyncStatus(t, prompt, true).tone, "attention");
});

test("a failed round is still an error", () => {
  const status = { ...base, error: "HTTP 500" };
  assert.equal(describeSyncStatus(t, status, true).tone, "error");
});
