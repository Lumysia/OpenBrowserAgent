import { useState } from "react";
import { storage } from "../shared/storage";
import { completeLocalBootstrapState } from "../shared/storage-debug";
import type { SyncGroupSettings } from "../shared/storage-keys";
import { checkSyncBackend, syncNow } from "../shared/sync/client";
import { parseSyncConfigCode } from "../shared/sync-config-code";
import type { SyncBackendConfig } from "../shared/types";

// Where joining sync stands: a code that could not be read, testing the
// backend, the first round, a failure, or connected.
export type SyncJoinPhase =
  "idle" | "invalid" | "testing" | "pulling" | "failed" | "connected";

export const syncJoinBusy = (phase: SyncJoinPhase) =>
  phase === "testing" || phase === "pulling";

// Connecting this device to a sync backend from a sync code or typed server
// details, the same in first-run setup and on the Sync page. The backend is
// tested first and, when it works, made active and synced at once: a device
// joining takes the remote data where it is newer and uploads what only it
// has.
export function useSyncJoin() {
  const [phase, setPhase] = useState<SyncJoinPhase>("idle");

  async function connect(
    backend: SyncBackendConfig,
    codeSettings?: SyncGroupSettings,
  ) {
    setPhase("testing");
    try {
      await checkSyncBackend(backend);
      setPhase("pulling");
      await storage.syncBackends.update((backends) => [
        ...backends.filter((existing) => existing.type !== backend.type),
        backend,
      ]);
      // A sync code's group settings replace this device's on purpose.
      if (codeSettings) await storage.syncGroups.replace(codeSettings);
      await storage.activeSyncBackendId.set(backend.id);
      const status = await syncNow();
      if (status.error) throw new Error(status.error);
      await completeLocalBootstrapState();
      setPhase("connected");
    } catch (error) {
      console.warn("Failed to connect sync backend", error);
      setPhase("failed");
    }
  }

  return {
    phase,
    busy: syncJoinBusy(phase),
    // Back to idle once the user edits what failed.
    reset: () =>
      setPhase((current) => (syncJoinBusy(current) ? current : "idle")),
    joinWithCode(code: string) {
      let parsed;
      try {
        parsed = parseSyncConfigCode(code);
      } catch {
        setPhase("invalid");
        return;
      }
      void connect(parsed.backend, parsed.syncGroups);
    },
    joinWithBackend: (backend: SyncBackendConfig) => void connect(backend),
  };
}
