// The scripts the extension runs in pages, by the path the build gives
// them: WXT names content scripts (`registration: "runtime"`) after their
// entrypoint, `content-scripts/<name>.js`; page-agent.js is an unlisted
// script; the element selector is a public file. Dependency-free: page
// scripts import their protocol modules, which use this one.
export const PAGE_SCRIPT = {
  // The read/act page agent, injected by page tools.
  pageAgent: "/page-agent.js",
  // Smart bar: the selection trigger registered on every page while the bar
  // is on, and the bar itself, injected when it opens.
  smartBar: "content-scripts/smart-bar.js",
  smartBarUi: "content-scripts/smart-bar-ui.js",
  // Injected when the user first translates a page.
  pageTranslate: "content-scripts/page-translate.js",
  // The translate button, registered in top frames while it is on, except
  // on the sites it is hidden on.
  pageTranslateButton: "content-scripts/page-translate-button.js",
  // Subtitle translation, and the observer that passes it the caption files
  // the page loads (in the page's own world): registered on every page while
  // "Translate video subtitles automatically" is on, else injected when the user starts
  // them.
  videoSubtitles: "content-scripts/video-subtitles.js",
  captionObserver: "content-scripts/caption-observer.js",
  // A short note on the page (page-feedback.ts).
  pageToast: "content-scripts/page-toast.js",
  elementSelector: "content-scripts/element-selector.js",
} as const;

// The ids of the scripts registered with scripting.registerContentScripts.
export const REGISTERED_SCRIPT_ID = {
  smartBar: "oba-smart-bar",
  videoSubtitles: "oba-video-subtitles",
  captionObserver: "oba-caption-observer",
  pageTranslateButton: "oba-page-translate-button",
} as const;

// Ids earlier versions registered, unregistered on start in case the
// browser kept them: the video's subtitle button (before 0.2.0-beta.11).
export const RETIRED_SCRIPT_IDS = ["oba-video-button"] as const;
