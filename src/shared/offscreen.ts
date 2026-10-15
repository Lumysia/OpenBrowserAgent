import type { CodeRunRequest } from "./code-sandbox/protocol";

// The offscreen document does DOM work for the Chrome service worker, which
// has no DOM: it parses HTML, holds the blob URLs of files the agent saves
// and hosts the code sandbox page. Background pages (Firefox, Safari) do
// these themselves.
export const OFFSCREEN_PATH = "/offscreen.html";

export const OFFSCREEN_MESSAGE = {
  htmlMarkdown: "offscreen:htmlMarkdown",
  createBlobUrl: "offscreen:createBlobUrl",
  revokeBlobUrl: "offscreen:revokeBlobUrl",
  runCode: "offscreen:runCode",
  cancelCode: "offscreen:cancelCode",
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

export type OffscreenRunCodeRequest = {
  type: typeof OFFSCREEN_MESSAGE.runCode;
  request: CodeRunRequest;
  // The manifest lists the sandboxed page (the offscreen document cannot
  // read the manifest).
  sandboxPage: boolean;
};

export type OffscreenCancelCodeRequest = {
  type: typeof OFFSCREEN_MESSAGE.cancelCode;
  id: string;
};

export type OffscreenRequest =
  | OffscreenHtmlMarkdownRequest
  | OffscreenCreateBlobUrlRequest
  | OffscreenRevokeBlobUrlRequest
  | OffscreenRunCodeRequest
  | OffscreenCancelCodeRequest;
