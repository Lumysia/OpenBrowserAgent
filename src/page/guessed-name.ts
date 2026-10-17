import { compact } from "../shared/text";

// A name for a link or button that has none (an icon-only control), taken
// from what it holds or where it goes, and where it came from, so the
// reader knows it is a guess.

export type NameSource = "title" | "icon" | "image" | "href";
export type Named = { name: string; from?: NameSource };

// Roles that get a guessed name when they have none.
export const GUESSED_NAME_ROLES = new Set(["link", "button"]);

const QUERY_MAX_CHARS = 30;
const HREF_MAX_CHARS = 80;

const clipped = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// What an icon inside says about itself: a label, an SVG title, a tooltip.
function iconName(element: Element) {
  for (const inner of element.querySelectorAll(
    "[aria-label], svg title, [title]",
  )) {
    const name = compact(
      inner.localName === "title"
        ? inner.textContent
        : inner.getAttribute("aria-label") || inner.getAttribute("title"),
    );
    if (name) return name;
  }
  return "";
}

function imageName(element: Element) {
  for (const image of element.querySelectorAll("img[alt]")) {
    const alt = compact(image.getAttribute("alt"));
    if (alt) return alt;
  }
  return "";
}

function decoded(text: string) {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

// Where a link goes, briefly: the path (and a clipped query) on this
// site, the host and path on another, the fragment of a link within the
// page.
function hrefName(element: Element) {
  const href = (element as HTMLAnchorElement).href;
  if (typeof href !== "string" || !href) return "";
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "";
  }
  if (!/^https?:$/.test(url.protocol)) return "";
  const here = new URL(location.href);
  const samePage =
    url.origin === here.origin &&
    url.pathname === here.pathname &&
    url.search === here.search;
  if (samePage) return url.hash.length > 1 ? decoded(url.hash) : "";
  const query = url.search ? clipped(url.search, QUERY_MAX_CHARS) : "";
  const path = `${url.pathname === "/" && query ? "" : url.pathname}${query}`;
  return clipped(
    decoded(
      url.origin === here.origin
        ? path
        : `${url.host}${path === "/" ? "" : path}`,
    ),
    HREF_MAX_CHARS,
  );
}

export function guessedName(element: Element, role: string): Named {
  const title = compact(element.getAttribute("title"));
  if (title) return { name: title, from: "title" };
  const icon = iconName(element);
  if (icon) return { name: icon, from: "icon" };
  const image = imageName(element);
  if (image) return { name: image, from: "image" };
  const href = role === "link" ? hrefName(element) : "";
  return href ? { name: href, from: "href" } : { name: "" };
}

// How a guessed name's source is written after it: ` (from href)`.
export const nameSourceNote = (named: Named) =>
  named.from ? ` (from ${named.from})` : "";
