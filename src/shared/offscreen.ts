// The offscreen document does DOM work for the Chrome service worker, which
// has no DOM: it parses HTML and holds the blob URLs of files the agent
// saves. Background pages (Firefox, Safari) do both themselves.
export const OFFSCREEN_PATH = "/offscreen.html";

export const OFFSCREEN_MESSAGE = {
  htmlMarkdown: "offscreen:htmlMarkdown",
  createBlobUrl: "offscreen:createBlobUrl",
  revokeBlobUrl: "offscreen:revokeBlobUrl",
} as const;

export type OffscreenHtmlMarkdownRequest = {
  type: typeof OFFSCREEN_MESSAGE.htmlMarkdown;
  html: string;
  url: string;
};

export type OffscreenCreateBlobUrlRequest = {
  type: typeof OFFSCREEN_MESSAGE.createBlobUrl;
  base64: string;
  mimeType: string;
};

export type OffscreenRevokeBlobUrlRequest = {
  type: typeof OFFSCREEN_MESSAGE.revokeBlobUrl;
  url: string;
};

export type OffscreenRequest =
  | OffscreenHtmlMarkdownRequest
  | OffscreenCreateBlobUrlRequest
  | OffscreenRevokeBlobUrlRequest;

export type OffscreenReply<T> =
  { ok: true; value: T } | { ok: false; error: string };
