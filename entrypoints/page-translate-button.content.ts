import { defineContentScript } from "wxt/utils/define-content-script";
import { installPageButton } from "../src/page-translate-button";

// Registered by the background only while the page button is on (see
// src/background/page-translate/button.ts); never in the manifest.
export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main: () => installPageButton(),
});
