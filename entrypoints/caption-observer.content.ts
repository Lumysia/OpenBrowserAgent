import { defineContentScript } from "wxt/utils/define-content-script";
import { installCaptionObserver } from "../src/video-subtitles/caption-observer";

// In the page's own world. Registered by the background while "Translate
// video subtitles" is on, else injected when the user starts subtitles (see
// src/background/video-subtitles); never in the manifest.
export default defineContentScript({
  registration: "runtime",
  world: "MAIN",
  main: () => installCaptionObserver(window),
});
