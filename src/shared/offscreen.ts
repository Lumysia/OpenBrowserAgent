// The offscreen document parses HTML for the Chrome service worker, which
// has no DOM. Background pages (Firefox, Safari) parse it themselves.
export const OFFSCREEN_PATH = "/offscreen.html";

export const OFFSCREEN_MESSAGE = {
  htmlMarkdown: "offscreen:htmlMarkdown",
} as const;

export type OffscreenHtmlMarkdownRequest = {
  type: typeof OFFSCREEN_MESSAGE.htmlMarkdown;
  html: string;
  url: string;
};
