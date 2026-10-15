// Translated subtitles drawn over the video in the extension's own layer:
// the original line on top, its translation below. A closed shadow root
// keeps the page's styles and scripts out. The layer sits in the element
// that is fullscreen (a player's fullscreen box), so it stays visible
// there; a video that is itself fullscreen or in picture-in-picture shows
// the lines through its own text track instead (see native-track.ts). It
// covers the part of the video the user sees (see placement.ts) and
// follows it when the window, the video or the player around it changes
// size, also while the video is paused.
import {
  clippingAncestors,
  layerPlacement,
  visibleBox,
  type ClippingAncestor,
} from "./placement";

// Marks the extension's elements in the page, so the caption finder and
// page translation leave them alone.
export const OWN_ATTRIBUTE = "data-oba-subtitles";

const CSS = `
:host { all: initial; }
.layer {
  --oba-subtitle-text: #fff;
  --oba-subtitle-translation: #ffe9a6;
  --oba-subtitle-background: rgb(8 8 8 / 0.78);
  --oba-subtitle-shadow: 0 1px 2px rgb(0 0 0 / 0.9);
  position: fixed;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15em;
  pointer-events: none;
  text-align: center;
  font: 500 var(--oba-subtitle-size, 20px) / 1.3 system-ui, sans-serif;
}
.layer[hidden] { display: none; }
.line {
  max-width: 90%;
  padding: 0.1em 0.45em;
  border-radius: 0.2em;
  background: var(--oba-subtitle-background);
  color: var(--oba-subtitle-text);
  text-shadow: var(--oba-subtitle-shadow);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.line:empty { display: none; }
.translation { color: var(--oba-subtitle-translation); }
.translation[data-pending] { opacity: 0.7; }
@media (prefers-reduced-motion: no-preference) {
  .translation { transition: opacity 120ms ease-out; }
}
`;

export type OverlayContent = {
  original: string;
  // The translation, or the part written so far.
  translation?: string;
  pending?: boolean;
};

export function createOverlay(video: HTMLVideoElement) {
  const host = document.createElement("div");
  host.setAttribute(OWN_ATTRIBUTE, "");
  host.setAttribute("translate", "no");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const layer = document.createElement("div");
  layer.className = "layer";
  layer.hidden = true;
  const original = document.createElement("div");
  original.className = "line original";
  const translation = document.createElement("div");
  translation.className = "line translation";
  translation.setAttribute("lang", "");
  layer.append(original, translation);
  shadow.append(style, layer);

  let content: OverlayContent | undefined;
  let clips: ClippingAncestor[] | undefined;

  // The fullscreen element when the video is inside it, else the page.
  function mount() {
    const fullscreen = document.fullscreenElement;
    const parent =
      fullscreen && fullscreen !== video && fullscreen.contains(video)
        ? fullscreen
        : document.body || document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
  }

  // The boxes that clip the video, watched with it for size changes (a
  // player that lays itself out after the window changed size). Found again
  // when the window or fullscreen changes.
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
    const visible =
      content?.original && !covered
        ? visibleBox(
            video.getBoundingClientRect(),
            clipping().map(({ element, x, y }) => ({
              box: element.getBoundingClientRect(),
              x,
              y,
            })),
            { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
          )
        : undefined;
    layer.hidden = !visible;
    if (!visible) return;
    mount();
    const placement = layerPlacement(visible, innerHeight);
    layer.style.setProperty("--oba-subtitle-size", `${placement.size}px`);
    layer.style.left = `${placement.left}px`;
    layer.style.width = `${placement.width}px`;
    layer.style.bottom = `${placement.bottom}px`;
  }

  // The layout changed around the video.
  const relaid = () => {
    clips = undefined;
    place();
  };
  const events: Array<[EventTarget, string, () => void]> = [
    [window, "resize", relaid],
    [window, "scroll", place],
    [document, "fullscreenchange", relaid],
  ];
  for (const [target, type, listener] of events)
    target.addEventListener(type, listener, { passive: true, capture: true });

  return {
    // What shows; undefined hides the layer.
    show(next: OverlayContent | undefined, language: string) {
      if (
        next?.original !== content?.original ||
        next?.translation !== content?.translation ||
        next?.pending !== content?.pending
      ) {
        original.textContent = next?.original ?? "";
        translation.textContent = next?.translation ?? "";
        translation.toggleAttribute("data-pending", !!next?.pending);
        translation.setAttribute("lang", language);
      }
      content = next;
      place();
    },
    place,
    dispose() {
      for (const [target, type, listener] of events)
        target.removeEventListener(type, listener, { capture: true });
      resized.disconnect();
      host.remove();
    },
  };
}
