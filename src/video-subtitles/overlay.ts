// Translated subtitles drawn over the video in the extension's own layer:
// the original line on top, its translation below. A closed shadow root
// keeps the page's styles and scripts out. The layer sits in the element
// that is fullscreen (a player's fullscreen box), so it stays visible
// there; a video that is itself fullscreen or in picture-in-picture shows
// the lines through its own text track instead (see native-track.ts).

// Marks the extension's elements in the page, so the caption finder and
// page translation leave them alone.
export const OWN_ATTRIBUTE = "data-oba-subtitles";

// Caption conventions rather than the page's look: light text on a dark
// box, sized from the video's height.
const SIZE = { share: 0.042, min: 12, max: 34 } as const;
// Above the player's control bar, as a share of the video's height.
const BOTTOM_SHARE = 0.1;

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

  // The fullscreen element when the video is inside it, else the page.
  function mount() {
    const fullscreen = document.fullscreenElement;
    const parent =
      fullscreen && fullscreen !== video && fullscreen.contains(video)
        ? fullscreen
        : document.body || document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
  }

  function place() {
    const rect = video.getBoundingClientRect();
    const covered =
      document.fullscreenElement === video ||
      document.pictureInPictureElement === video;
    const visible =
      !!content?.original && !covered && rect.width > 0 && rect.height > 0;
    layer.hidden = !visible;
    if (!visible) return;
    mount();
    const size = Math.min(
      SIZE.max,
      Math.max(SIZE.min, rect.height * SIZE.share),
    );
    layer.style.setProperty("--oba-subtitle-size", `${size}px`);
    layer.style.left = `${rect.left}px`;
    layer.style.width = `${rect.width}px`;
    layer.style.bottom = `${innerHeight - rect.bottom + rect.height * BOTTOM_SHARE}px`;
  }

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
      host.remove();
    },
  };
}
