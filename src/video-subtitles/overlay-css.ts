// The subtitle layer's elements and CSS, for the layer over videos
// (overlay.ts) and the preview in Settings. The user's style reaches the
// CSS as custom properties on `.layer` (see subtitleStyleProperties).
import {
  DEFAULT_SUBTITLE_STYLE,
  subtitleStyleProperties,
  type SubtitleStyle,
} from "../shared/video-subtitles/style";

// The original line, as a share of the translation's size: the translation
// is what the reader follows. The lines' boxes touch, so where they meet
// the video isn't darkened twice and there is no gap between them.
export const SUBTITLE_LAYER_CSS = `
:host { all: initial; }
.layer {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  text-align: center;
  font: 500 calc(var(--oba-subtitle-size, 20px) * var(--oba-subtitle-scale))
    / 1.3 var(--oba-subtitle-font);
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
.original {
  display: var(--oba-subtitle-original-display);
  font-size: 0.85em;
}
.original:empty { display: none; }
.word[data-ahead] { visibility: hidden; }
.translation { color: var(--oba-subtitle-translation); }
.translation[data-pending] { opacity: 0.7; }
@media (prefers-reduced-motion: no-preference) {
  .translation { transition: opacity 120ms ease-out; }
}
`;

export function applySubtitleStyle(layer: HTMLElement, style: SubtitleStyle) {
  for (const [name, value] of Object.entries(subtitleStyleProperties(style)))
    layer.style.setProperty(name, value);
}

// The layer with its two lines, in the default style.
export function createSubtitleLayer() {
  const layer = document.createElement("div");
  layer.className = "layer";
  const original = document.createElement("div");
  original.className = "line original";
  const translation = document.createElement("div");
  translation.className = "line translation";
  translation.setAttribute("lang", "");
  layer.append(original, translation);
  applySubtitleStyle(layer, DEFAULT_SUBTITLE_STYLE);
  return { layer, original, translation };
}
