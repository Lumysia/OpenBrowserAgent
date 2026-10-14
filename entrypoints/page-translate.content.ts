import { defineContentScript } from "wxt/utils/define-content-script";
import { installPageTranslate } from "../src/page-translate";

// Injected by the background the first time a page is translated (see
// src/background/page-translate/index.ts); never in the manifest.
export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main: () => installPageTranslate(),
});
