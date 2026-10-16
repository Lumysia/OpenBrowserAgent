import { getBrowserApi } from "./browser-api";
import { OPTIONS_HASH } from "./config";
import { sessionRecord } from "./session-record";
import {
  FIRST_SETUP_STEP,
  type SetupProgress,
  type SetupReturn,
} from "./setup-steps";
import { STORAGE_KEYS } from "./storage-keys";
import { focusTab, openOrFocusOptions } from "./tab-navigation";

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

// Setup from its first step, also in a setup page already open. Run from
// a settings page (`hash`), setup goes back to it when done.
export async function restartSetup(hash?: string) {
  const api = getBrowserApi();
  const tabId = hash ? (await api.tabs.getCurrent())?.id : undefined;
  await setupProgress.update((progress) => {
    const { returnTo: _previous, ...rest } = progress ?? {};
    return {
      ...rest,
      step: FIRST_SETUP_STEP,
      ...(hash && tabId !== undefined && { returnTo: { tabId, hash } }),
    };
  });
  await openSetup();
}

// Leaves the setup page once it handed over to the side panel: back to the
// settings page that ran it again (in this tab where setup took its place,
// else in its own tab, and this one closes), or this tab closes.
export async function leaveSetup(returnTo: SetupReturn | undefined) {
  const api = getBrowserApi();
  const own = (await api.tabs.getCurrent())?.id;
  if (own === undefined) return;
  if (returnTo?.tabId === own)
    return focusTab(own, api.runtime.getURL(`/options.html${returnTo.hash}`));
  if (returnTo) await focusTab(returnTo.tabId).catch(() => undefined);
  await api.tabs.remove(own);
}
