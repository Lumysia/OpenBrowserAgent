import { defineContentScript } from "wxt/utils/define-content-script";
import { installVideoSubtitles } from "../src/video-subtitles";

// Injected by the background when the user starts translating a video's
// subtitles (see src/background/video-subtitles); never in the manifest.
export default defineContentScript({
  registration: "runtime",
  // Tells the page nothing about the extension.
  noScriptStartedPostMessage: true,
  main: () => installVideoSubtitles(),
});
