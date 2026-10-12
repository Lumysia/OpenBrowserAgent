import { htmlMarkdown } from "../../src/page/html-markdown";
import {
  OFFSCREEN_MESSAGE,
  type OffscreenHtmlMarkdownRequest,
} from "../../src/shared/offscreen";

chrome.runtime.onMessage.addListener(
  (message: OffscreenHtmlMarkdownRequest, _sender, sendResponse) => {
    if (message?.type !== OFFSCREEN_MESSAGE.htmlMarkdown) return false;
    try {
      sendResponse({
        ok: true,
        value: htmlMarkdown(message.html, message.url),
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  },
);
