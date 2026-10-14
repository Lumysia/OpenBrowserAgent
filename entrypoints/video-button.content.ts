import { defineContentScript } from "wxt/utils/define-content-script";
import { installVideoButton } from "../src/video-subtitles/button";

// Registered by the background only while the video button is on (see
// src/background/video-subtitles/registration.ts); never in the manifest.
export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main: () => installVideoButton(),
});
