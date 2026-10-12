import { getBrowserApi } from "./browser-api";
import { SMART_BAR_HANDOFF_KEY } from "./smart-bar-protocol";

// A handoff the side panel did not pick up within this time is dropped.
export const SMART_BAR_HANDOFF_TTL_MS = 60_000;

// Session storage keeps the selected text off disk; browsers without it use
// local storage (the panel removes the entry when it takes it).
export function smartBarHandoffStorage() {
  const api = getBrowserApi();
  return api.storage.session
    ? { area: api.storage.session, name: "session", key: SMART_BAR_HANDOFF_KEY }
    : { area: api.storage.local, name: "local", key: SMART_BAR_HANDOFF_KEY };
}
