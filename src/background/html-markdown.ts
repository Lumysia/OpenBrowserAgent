import { htmlMarkdown, type HtmlMarkdown } from "../page/html-markdown";
import {
  OFFSCREEN_MESSAGE,
  type OffscreenHtmlMarkdownRequest,
} from "../shared/offscreen";
import { offscreenRequest } from "./offscreen";

// Readable Markdown of fetched HTML. Background pages have a DOM to parse it
// in; Chrome's service worker hands it to the offscreen document.
export async function fetchedHtmlMarkdown(
  html: string,
  url: string,
): Promise<HtmlMarkdown> {
  if (typeof DOMParser === "function") return htmlMarkdown(html, url);
  const request: OffscreenHtmlMarkdownRequest = {
    type: OFFSCREEN_MESSAGE.htmlMarkdown,
    html,
    url,
  };
  return offscreenRequest(request, "The page could not be parsed.");
}
