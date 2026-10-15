import { OPTIONS_HASH } from "./config";
import { sessionRecord } from "./session-record";
import { FIRST_SETUP_STEP, type SetupProgress } from "./setup-steps";
import { STORAGE_KEYS } from "./storage-keys";
import { openOrFocusOptions } from "./tab-navigation";

// Where the guided setup stands in this browser session; undefined before
// it ran (see resumeSetupProgress).
export const setupProgress = sessionRecord<SetupProgress | undefined>(
  STORAGE_KEYS.setupProgress,
  () => undefined,
);

// Opens setup where it was left; a setup page already open goes on as it is.
export function openSetup() {
  return openOrFocusOptions(OPTIONS_HASH.welcome);
}

// Setup from its first step, also in a setup page already open.
export async function restartSetup() {
  await setupProgress.update((progress) => ({
    ...progress,
    step: FIRST_SETUP_STEP,
  }));
  await openSetup();
}
