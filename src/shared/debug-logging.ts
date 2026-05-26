import { storage } from "./storage";

let initialized = false;
let enabled = false;

export function debugLog(label: string, details: Record<string, unknown>) {
  initDebugLogging();
  if (enabled) console.info(label, details);
}

export function isDebugLoggingEnabled() {
  initDebugLogging();
  return enabled;
}

function initDebugLogging() {
  if (initialized) return;
  initialized = true;
  storage.debugLoggingEnabled
    .get()
    .then((value) => {
      enabled = value === true;
    })
    .catch(() => undefined);
  storage.debugLoggingEnabled.watch((value) => {
    enabled = value === true;
  });
}
