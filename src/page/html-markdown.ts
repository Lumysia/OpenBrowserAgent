import { compact } from "./dom";
import { pageMarkdown } from "./markdown";

export type HtmlMarkdown = { title: string; text: string };

// Readable Markdown of fetched HTML, for `read` on a URL. DOMParser builds an
// inert document: its scripts never run and nothing it references loads.
export function htmlMarkdown(html: string, url: string): HtmlMarkdown {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Links resolve against the page's own address, not the parser's.
  const base = doc.querySelector("base[href]") || doc.createElement("base");
  base.setAttribute("href", resolve(base.getAttribute("href") || "", url));
  if (!base.isConnected) doc.head.prepend(base);
  const origin = new URL(url).origin;
  // Without style sheets, menus and pickers the page hides would show up.
  return { title: compact(doc.title), text: mainMarkdown(doc, origin) };
}

// The main landmark, when there is one, keeps to the content.
export function mainMarkdown(doc: Document, origin: string) {
  const main = doc.querySelector("main, [role=main]");
  return (
    (main && pageMarkdown(main, origin)) ||
    pageMarkdown(doc.body || doc.documentElement, origin)
  );
}

function resolve(href: string, url: string) {
  try {
    return new URL(href, url).href;
  } catch {
    return url;
  }
}
