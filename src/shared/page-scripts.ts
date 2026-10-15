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
  // Subtitle translation, injected when the user starts it; the video
  // button, registered on every page while it is on.
  videoSubtitles: "content-scripts/video-subtitles.js",
  videoButton: "content-scripts/video-button.js",
  // A short note on the page (page-feedback.ts).
  pageToast: "content-scripts/page-toast.js",
  elementSelector: "content-scripts/element-selector.js",
} as const;

// The ids of the scripts registered with scripting.registerContentScripts.
export const REGISTERED_SCRIPT_ID = {
  smartBar: "oba-smart-bar",
  videoButton: "oba-video-button",
} as const;
