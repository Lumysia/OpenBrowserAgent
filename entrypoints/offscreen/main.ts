import { htmlMarkdown } from "../../src/page/html-markdown";
import { base64ToBytes } from "../../src/shared/binary";
import { codeHost } from "../../src/shared/code-sandbox/host";
import {
  OFFSCREEN_MESSAGE,
  type OffscreenRequest,
} from "../../src/shared/offscreen";

async function handle(message: OffscreenRequest) {
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
    // Only Chrome has the offscreen document, and its manifest always lists
    // the code sandbox page.
    case OFFSCREEN_MESSAGE.runCode:
      return (await codeHost(true)).run(message.request);
    case OFFSCREEN_MESSAGE.cancelCode:
      (await codeHost(true)).cancel(message.id);
      return true;
  }
}

const TYPES = new Set<string>(Object.values(OFFSCREEN_MESSAGE));

chrome.runtime.onMessage.addListener(
  (message: OffscreenRequest, _sender, sendResponse) => {
    if (!TYPES.has(message?.type)) return false;
    handle(message).then(
      (value) => sendResponse({ ok: true, value }),
      (error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return true;
  },
);
