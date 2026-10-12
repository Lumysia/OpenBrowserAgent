import { htmlMarkdown, type HtmlMarkdown } from "../page/html-markdown";
import {
  OFFSCREEN_MESSAGE,
  OFFSCREEN_PATH,
  type OffscreenHtmlMarkdownRequest,
} from "../shared/offscreen";

// Readable Markdown of fetched HTML. Background pages have a DOM to parse it
// in; Chrome's service worker hands it to the offscreen document.
export async function fetchedHtmlMarkdown(
  html: string,
  url: string,
): Promise<HtmlMarkdown> {
  if (typeof DOMParser === "function") return htmlMarkdown(html, url);
  await ensureOffscreen();
  const request: OffscreenHtmlMarkdownRequest = {
    type: OFFSCREEN_MESSAGE.htmlMarkdown,
    html,
    url,
  };
  const reply = await chrome.runtime.sendMessage(request);
  if (!reply?.ok)
    throw new Error(reply?.error || "The page could not be parsed.");
  return reply.value;
}

let creating: Promise<void> | undefined;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (existing.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: "Read the text of web pages fetched by the read tool.",
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}
