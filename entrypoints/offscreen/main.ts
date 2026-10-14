import { htmlMarkdown } from "../../src/page/html-markdown";
import { base64ToBytes } from "../../src/shared/binary";
import {
  OFFSCREEN_MESSAGE,
  type OffscreenRequest,
} from "../../src/shared/offscreen";

function handle(message: OffscreenRequest) {
  switch (message.type) {
    case OFFSCREEN_MESSAGE.htmlMarkdown:
      return htmlMarkdown(message.html, message.url);
    case OFFSCREEN_MESSAGE.createBlobUrl:
      return URL.createObjectURL(
        new Blob([base64ToBytes(message.base64)], { type: message.mimeType }),
      );
    case OFFSCREEN_MESSAGE.revokeBlobUrl:
      URL.revokeObjectURL(message.url);
      return true;
  }
}

const TYPES = new Set<string>(Object.values(OFFSCREEN_MESSAGE));

chrome.runtime.onMessage.addListener(
  (message: OffscreenRequest, _sender, sendResponse) => {
    if (!TYPES.has(message?.type)) return false;
    try {
      sendResponse({ ok: true, value: handle(message) });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  },
);
