// Messages between the subtitle page scripts and the background.
// Dependency-free (types only): the page scripts import this module.
import type { PageToastTheme } from "../page-toast";

// Built by WXT (`registration: "runtime"`). The subtitle script is injected
// when the user starts translating subtitles; the button script is
// registered on every page while the video button is on.
export const VIDEO_SUBTITLES_SCRIPT = {
  main: "content-scripts/video-subtitles.js",
  button: "content-scripts/video-button.js",
} as const;

export const VIDEO_SUBTITLES_MESSAGE = {
  // Background -> page: start or stop translating one video's subtitles
  // (the one the user pointed at: its button, or the right-click).
  toggle: "video-subtitles:toggle",
  // Background -> page: start translating every video in the frame (the
  // user translated the page), or stop all of them.
  startAll: "video-subtitles:start-all",
  stopAll: "video-subtitles:stop-all",
  // Button -> background: the user pressed the button on a video.
  button: "video-subtitles:button",
  // Button -> background: the button's labels, in the extension's language.
  labels: "video-subtitles:labels",
  // Page -> background: watch the caption files the page loads from now on
  // (see main-world.ts). Answers `{ ok: boolean }`.
  observe: "video-subtitles:observe",
} as const;

// Notes the page may show, in the extension's language and theme.
export type VideoSubtitlesNotes = {
  // Nothing to translate turned up for a while after starting.
  noCaptions: string;
  theme: PageToastTheme;
};

export type VideoSubtitlesToggleMessage = {
  type: typeof VIDEO_SUBTITLES_MESSAGE.toggle;
  // The right-clicked video's source, when the browser reports one.
  srcUrl?: string;
  notes: VideoSubtitlesNotes;
};

export type VideoSubtitlesStartAllMessage = {
  type: typeof VIDEO_SUBTITLES_MESSAGE.startAll;
  notes: VideoSubtitlesNotes;
};

export type VideoSubtitlesStopAllMessage = {
  type: typeof VIDEO_SUBTITLES_MESSAGE.stopAll;
};

export type VideoSubtitlesObserveMessage = {
  type: typeof VIDEO_SUBTITLES_MESSAGE.observe;
  // The DOM event the main-world observer reports caption files with.
  event: string;
};

export type VideoButtonLabels = { start: string; stop: string };

// Shared between the extension's scripts in a frame (they share the
// isolated world; page scripts can't reach it): the video the user last
// pointed at, which videos have translated subtitles, and who wants to know
// when that changes.
type SharedState = {
  pointed?: WeakRef<HTMLVideoElement>;
  isActive?: (video: HTMLVideoElement) => boolean;
  listeners: Set<() => void>;
};

const SHARED = Symbol.for("oba.videoSubtitles.shared");

export function videoSubtitlesShared(): SharedState {
  const scope = globalThis as unknown as Record<symbol, SharedState>;
  return (scope[SHARED] ??= { listeners: new Set() });
}

export function activeVideosChanged() {
  videoSubtitlesShared().listeners.forEach((listener) => listener());
}

// What the main-world observer passes on, at most: larger responses aren't
// read (see CAPTION_FILE_LIMITS).
export const CAPTION_RESPONSE_MAX_CHARS = 5_000_000;

// Smaller videos (previews, thumbnails) get no button and aren't started by
// "Translate this page".
export const MIN_VIDEO_SIZE = { width: 160, height: 90 } as const;
