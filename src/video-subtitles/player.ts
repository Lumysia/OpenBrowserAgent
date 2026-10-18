// The player around a video and the captions it draws as page text, found
// by structure and layout only, never by the site or its class names. Both
// readers of the player's captions use it: the one that reads them as the
// only source (sources/dom-captions.ts) and the one that hides them while
// our lines show (player-captions.ts).
import { OWN_ATTRIBUTE } from "./overlay";
import { CONTROLS } from "./sources/pointed-controls";

// A player wraps its video in boxes about its size.
const PLAYER_AREA_SHARE = 1.6;
// Marks the boxes of the player's captions we hide while ours show.
export const HIDDEN_ATTRIBUTE = "data-oba-hidden-captions";
// Hidden without moving anything: the box keeps its place, its text stays
// readable (innerText leaves out text with `visibility: hidden`), and the
// pointer goes through it to the video.
const HIDDEN_CSS = `[${HIDDEN_ATTRIBUTE}], [${HIDDEN_ATTRIBUTE}] * { opacity: 0 !important; pointer-events: none !important; }`;

const area = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
};

// The player around `video`: its largest ancestor about the video's size.
export function playerOf(video: HTMLVideoElement) {
  const own = area(video);
  let player: Element = video.parentElement ?? video;
  for (
    let parent = player.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    if (own > 0 && area(parent) > own * PLAYER_AREA_SHARE) break;
    player = parent;
  }
  return player;
}

// An element's text as it shows: spacing collapsed, one line per line.
export function shownText(element: Element) {
  return ((element as HTMLElement).innerText ?? element.textContent ?? "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// The language the player declares for `element`'s text: a `lang` on it or
// on a box of the player's around it. The document's own is the site's,
// not the video's.
export function declaredLanguage(element: Element, player: Element) {
  const marked = element.closest("[lang]");
  return (
    (marked &&
      player.contains(marked) &&
      marked.getAttribute("lang")?.trim()) ||
    undefined
  );
}

// Inside our own layer or the player's controls.
export function isSkipped(element: Element) {
  return !!(element.closest(`[${OWN_ATTRIBUTE}]`) || element.closest(CONTROLS));
}

// Holds our layer or a control of the player's.
export function holdsSkipped(element: Element) {
  return !!element.querySelector(`[${OWN_ATTRIBUTE}], ${CONTROLS}`);
}

// Whether the middle of `element` is over the video.
export function isOverVideo(element: Element, video: HTMLVideoElement) {
  const rect = element.getBoundingClientRect();
  const frame = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  return (
    x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom
  );
}

// How many hide each element, and the stylesheet each root has for them.
const hiders = new WeakMap<Element, number>();
const sheets = new WeakMap<Document | ShadowRoot, HTMLStyleElement>();

function ensureSheet(root: Document | ShadowRoot) {
  let style = sheets.get(root);
  if (style?.isConnected) return;
  style ??= document.createElement("style");
  style.setAttribute(OWN_ATTRIBUTE, "");
  style.textContent = HIDDEN_CSS;
  sheets.set(root, style);
  const parent =
    root instanceof ShadowRoot ? root : root.head || root.documentElement;
  parent.append(style);
}

// Hides `element` (a box of the player's captions) until the returned
// function is called; boxes hidden by several readers show again when the
// last one lets go. Only an attribute is added: the player can keep
// changing the box's own style.
export function hideCaptionBox(element: Element) {
  const root = element.getRootNode();
  if (root instanceof Document || root instanceof ShadowRoot) ensureSheet(root);
  hiders.set(element, (hiders.get(element) ?? 0) + 1);
  element.setAttribute(HIDDEN_ATTRIBUTE, "");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (hiders.get(element) ?? 1) - 1;
    if (count > 0) return void hiders.set(element, count);
    hiders.delete(element);
    element.removeAttribute(HIDDEN_ATTRIBUTE);
  };
}
