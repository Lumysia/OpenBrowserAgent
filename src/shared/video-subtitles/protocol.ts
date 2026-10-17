// Messages between the subtitle page scripts and the background.
// Dependency-free (types only): the page scripts import this module.
import type { PageToastTheme } from "../page-toast";
import type { SubtitleStyle } from "./style";

export const VIDEO_SUBTITLES_MESSAGE = {
  // Background -> page: start or stop translating one video's subtitles
  // (the one the user right-clicked).
  toggle: "video-subtitles:toggle",
  // Background -> page: start translating every video in the frame (the
  // user translated the page), or stop all of them.
  startAll: "video-subtitles:start-all",
  stopAll: "video-subtitles:stop-all",
  // Page -> background: whether subtitles start by themselves, and how they
  // look. Answers VideoSubtitlesConfig.
  config: "video-subtitles:config",
  // Page -> background: put the caption observer in the frame's page world
  // if it isn't there yet (see caption-observer.ts). Answers
  // `{ ok: boolean }`.
  observe: "video-subtitles:observe",
  // Page -> background: the frame's translated subtitles started or all
  // stopped (the menus show it).
  state: "video-subtitles:state",
} as const;

// Global symbol (Symbol.for) under which the subtitle script keeps whether
// any of the frame's videos has translated subtitles, for the background's
// probe in the extension's isolated world.
export const VIDEO_SUBTITLES_ACTIVE_KEY = "oba.videoSubtitles.active";

// The DOM event the caption observer passes caption files with; its detail
// is the JSON of `{ url, text }`. Page data: the page can fire it too.
export const CAPTION_FILE_EVENT = "oba-caption-file";

// Notes the page may show, in the extension's language and theme.
export type VideoSubtitlesNotes = {
  // Nothing to translate turned up for a while after starting.
  noCaptions: string;
  // Only captions drawn on screen were found: they can't be translated ahead.
  liveOnly: string;
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

export type VideoSubtitlesConfig = {
  // "Translate video subtitles automatically" is on.
  always: boolean;
  style: SubtitleStyle;
};

// What the caption observer passes on, at most: larger responses aren't
// read (see CAPTION_FILE_LIMITS).
export const CAPTION_RESPONSE_MAX_CHARS = 5_000_000;

// Smaller videos (previews, thumbnails) don't get subtitles by themselves
// and aren't started by "Translate this page".
export const MIN_VIDEO_SIZE = { width: 160, height: 90 } as const;
