import { defineContentScript } from "wxt/utils/define-content-script";
import { installSmartBarTrigger } from "../src/smart-bar/trigger";

// Registered by the background only while the smart bar is on (see
// src/background/smart-bar/registration.ts); never listed in the manifest.
export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  // Not WXT's context: pages can invalidate it with a DOM event.
  main: () => installSmartBarTrigger(),
});
