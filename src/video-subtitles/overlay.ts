// Translated subtitles drawn over the video in the extension's own layer:
// the original line on top, its translation below. A closed shadow root
// keeps the page's styles and scripts out. A video that is itself
// fullscreen or in picture-in-picture shows the lines through its own text
// track instead (see native-track.ts).
//
// The layer sits next to the video, positioned in the same box, so the
// browser moves it with the video when the page scrolls (a script that
// follows the video is always a frame behind). Where that can't work (see
// layerParent) it is fixed to the viewport, in the fullscreen element when
// the video is inside one. It covers the part of the video the user sees
// (see placement.ts) and is placed again when the video, the player around
// it, the window or fullscreen change size, also while the video is paused.
import {
  clippingAncestors,
  layerParent,
  layerPlacement,
  visibleBox,
  type ClippingAncestor,
} from "./placement";
import type { SubtitleStyle } from "../shared/video-subtitles/style";
import {
  applySubtitleStyle,
  createSubtitleLayer,
  SUBTITLE_LAYER_CSS,
} from "./overlay-css";

// Marks the extension's elements in the page, so the caption finder and
// page translation leave them alone.
export const OWN_ATTRIBUTE = "data-oba-subtitles";

// A player that re-renders its children may drop the layer: it is put back,
// unless that keeps happening this often, then it moves to the viewport.
const REMOVALS = { count: 5, withinMs: 2_000 } as const;

// The host is an empty box at its containing block's corner, which the
// layer is placed from; inline and important, so the page's rules for its
// own elements can't move it.
const HOST_STYLE = {
  display: "block",
  top: "0",
  left: "0",
  right: "auto",
  bottom: "auto",
  width: "0",
  height: "0",
  margin: "0",
  padding: "0",
  border: "0",
  overflow: "visible",
  transform: "none",
  "z-index": "2147483646",
  "pointer-events": "none",
} as const;

export type OverlayContent = {
  original: string;
  // The original's words with their spacing, for a line whose words are
  // timed, and how many of them are said: the others keep their place,
  // unseen, so the line doesn't move as they come.
  words?: readonly { text: string }[];
  said?: number;
  // The translation, or the part written so far.
  translation?: string;
  pending?: boolean;
};

export function createOverlay(
  video: HTMLVideoElement,
  subtitleStyle: SubtitleStyle,
) {
  const host = document.createElement("div");
  host.setAttribute(OWN_ATTRIBUTE, "");
  host.setAttribute("translate", "no");
  for (const [name, value] of Object.entries(HOST_STYLE))
    host.style.setProperty(name, value, "important");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = SUBTITLE_LAYER_CSS;
  const { layer, original, translation } = createSubtitleLayer();
  layer.hidden = true;
  applySubtitleStyle(layer, subtitleStyle);
  shadow.append(style, layer);

  let content: OverlayContent | undefined;
  // The word spans of the original, and how many show.
  let wordSpans: HTMLSpanElement[] = [];
  let shownWords = 0;
  let clips: ClippingAncestor[] | undefined;
  // Where the layer is, and the video's parent it was placed for.
  let parent: Node | undefined;
  let videoParent: Node | null = null;
  let fixed: boolean | undefined;
  // The layer was dropped too often next to the video.
  let fixedOnly = false;
  const removals: number[] = [];

  const dropped = new MutationObserver(() => {
    if (!parent || host.parentNode === parent) return;
    const now = performance.now();
    removals.push(now);
    while (removals[0]! < now - REMOVALS.withinMs) removals.shift();
    if (removals.length < REMOVALS.count) return relaid();
    if (fixed) return;
    fixedOnly = true;
    relaid();
  });

  function mount() {
    videoParent = video.parentNode;
    const inline = fixedOnly ? undefined : layerParent(video);
    const fullscreen = document.fullscreenElement;
    const next =
      inline ??
      (fullscreen && fullscreen !== video && fullscreen.contains(video)
        ? fullscreen
        : document.body || document.documentElement);
    if (fixed !== !inline) {
      const wasFixed = fixed;
      fixed = !inline;
      host.style.setProperty(
        "position",
        fixed ? "fixed" : "absolute",
        "important",
      );
      if (fixed)
        window.addEventListener("scroll", place, {
          passive: true,
          capture: true,
        });
      else if (wasFixed)
        window.removeEventListener("scroll", place, { capture: true });
    }
    if (host.parentNode !== next) next.appendChild(host);
    if (parent !== next) {
      parent = next;
      dropped.disconnect();
      dropped.observe(next, { childList: true });
    }
  }

  function moved() {
    return (
      !host.isConnected ||
      host.parentNode !== parent ||
      video.parentNode !== videoParent
    );
  }

  // The boxes that clip the video, watched with it for size changes (a
  // player that lays itself out after the window changed size). Found again
  // when the layout around the video changes.
  const resized = new ResizeObserver(() => place());
  function clipping() {
    if (clips?.every(({ element }) => element.isConnected)) return clips;
    clips = clippingAncestors(video);
    resized.disconnect();
    resized.observe(video);
    for (const { element } of clips) resized.observe(element);
    return clips;
  }

  function place() {
    const covered =
      document.fullscreenElement === video ||
      document.pictureInPictureElement === video;
    if (!content?.original || covered) {
      layer.hidden = true;
      return;
    }
    if (moved()) mount();
    // A layer in the page is cut by the viewport like the video is.
    const visible = visibleBox(
      video.getBoundingClientRect(),
      clipping().map(({ element, x, y }) => ({
        box: element.getBoundingClientRect(),
        x,
        y,
      })),
      fixed
        ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        : undefined,
    );
    layer.hidden = !visible;
    if (!visible) return;
    const placement = layerPlacement(visible, host.getBoundingClientRect());
    layer.style.setProperty("--oba-subtitle-size", `${placement.size}px`);
    layer.style.left = `${placement.left}px`;
    layer.style.width = `${placement.width}px`;
    // The host has no height: its bottom edge is its top.
    layer.style.bottom = `${-placement.bottom}px`;
  }

  function setOriginal(next: OverlayContent | undefined) {
    wordSpans =
      next?.words?.map((word) => {
        const span = document.createElement("span");
        span.className = "word";
        span.textContent = word.text;
        return span;
      }) ?? [];
    shownWords = wordSpans.length;
    if (wordSpans.length) original.replaceChildren(...wordSpans);
    else original.textContent = next?.original ?? "";
  }

  // Only the words whose state changes are touched: this runs each frame.
  function reveal(said: number) {
    const count = Math.max(0, Math.min(said, wordSpans.length));
    for (
      let index = Math.min(count, shownWords);
      index < Math.max(count, shownWords);
      index++
    )
      wordSpans[index]!.toggleAttribute("data-ahead", index >= count);
    shownWords = count;
  }

  // The layout changed around the video.
  function relaid() {
    clips = undefined;
    parent = undefined;
    place();
  }
  const events: Array<[EventTarget, string, () => void]> = [
    [window, "resize", relaid],
    [document, "fullscreenchange", relaid],
    [video, "enterpictureinpicture", place],
    [video, "leavepictureinpicture", place],
  ];
  for (const [target, type, listener] of events)
    target.addEventListener(type, listener, { passive: true, capture: true });

  return {
    // What shows; undefined hides the layer. A layer next to the video moves
    // with it by itself; one fixed to the viewport is placed each time.
    show(next: OverlayContent | undefined, language: string) {
      const appears = !!next?.original !== !!content?.original;
      if (
        next?.original !== content?.original ||
        next?.words !== content?.words
      )
        setOriginal(next);
      if (next?.words) reveal(next.said ?? next.words.length);
      if (
        next?.original !== content?.original ||
        next?.translation !== content?.translation ||
        next?.pending !== content?.pending
      ) {
        translation.textContent = next?.translation ?? "";
        translation.toggleAttribute("data-pending", !!next?.pending);
        translation.setAttribute("lang", language);
      }
      content = next;
      if (appears || fixed || moved()) place();
    },
    setStyle(next: SubtitleStyle) {
      applySubtitleStyle(layer, next);
    },
    dispose() {
      for (const [target, type, listener] of events)
        target.removeEventListener(type, listener, { capture: true });
      window.removeEventListener("scroll", place, { capture: true });
      resized.disconnect();
      dropped.disconnect();
      host.remove();
    },
  };
}
