import { defineContentScript } from "wxt/utils/define-content-script";
import { showPageToast } from "../src/page-toast";
import { PAGE_TOAST_GLOBAL } from "../src/shared/page-toast";

// Page notes for the background (see src/background/page-feedback.ts): it
// injects this, then calls showPageToast through the global. Never in the
// manifest.
export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main() {
    (globalThis as Record<string, unknown>)[PAGE_TOAST_GLOBAL] = showPageToast;
  },
});
