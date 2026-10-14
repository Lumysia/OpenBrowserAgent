import { htmlMarkdown } from "../../src/page/html-markdown";
import { base64ToBytes } from "../../src/shared/binary";
import {
  cancelSandboxRun,
  codeSandbox,
} from "../../src/shared/code-sandbox/host";
import { errorMessage } from "../../src/shared/error-message";
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
    case OFFSCREEN_MESSAGE.runCode:
      return codeSandbox(message.sandboxPage).run(message.request);
    case OFFSCREEN_MESSAGE.cancelCode:
      cancelSandboxRun(message.id);
      return true;
  }
}

const TYPES = new Set<string>(Object.values(OFFSCREEN_MESSAGE));

chrome.runtime.onMessage.addListener(
  (message: OffscreenRequest, sender, sendResponse) => {
    // Only the extension's own pages and service worker, never content
    // scripts in web pages, may ask.
    if (!TYPES.has(message?.type)) return false;
    if (sender.id !== chrome.runtime.id || sender.tab) return false;
    handle(message).then(
      (value) => sendResponse({ ok: true, value }),
      (error) =>
        sendResponse({
          ok: false,
          error: errorMessage(error),
        }),
    );
    return true;
  },
);
