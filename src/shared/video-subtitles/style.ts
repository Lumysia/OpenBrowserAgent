// How translated subtitles look: what the user picks in Settings, kept
// in the page translation settings and sent to the pages with the subtitle
// config. Dependency-free: the page script imports this module.
import { contrast, parseHexColor } from "../theme/color";
import { oneOf } from "../values";

// How much the box behind each line covers the video, in percent: 0 draws
// the text alone, 100 an opaque box.
export const SUBTITLE_OPACITY = { min: 0, max: 100, step: 5 } as const;

// Named colours: white is the default, grey a quick choice beside the
// colour pickers (with the theme colour, see theme-color.ts). Each keeps
// a contrast of 4.5:1 or more on the box at SUBTITLE_OUTLINE_OPACITY over a
// white frame (checked by a unit test).
export const SUBTITLE_COLORS = {
  white: "#ffffff",
  grey: "#e6e6e6",
} as const;

// Up to 0.2.0-beta.24 the colours were stored by these names; they read as
// the colours they showed. Fixed: changing the presets doesn't change them.
const NAMED_SUBTITLE_COLORS: Readonly<Record<string, string>> = {
  yellow: "#ffe9a6",
  white: "#ffffff",
  cyan: "#bfefff",
  grey: "#e6e6e6",
};

export const SUBTITLE_FONT = {
  system: "system",
  serif: "serif",
  monospace: "monospace",
} as const;

export type SubtitleFont = (typeof SUBTITLE_FONT)[keyof typeof SUBTITLE_FONT];

// Percent of the size the layer picks from the video's height.
export const SUBTITLE_SCALES = [80, 90, 100, 115, 130, 150] as const;

export type SubtitleScale = (typeof SUBTITLE_SCALES)[number];

export type SubtitleStyle = {
  backgroundOpacity: number;
  // `#rrggbb`, lowercase.
  translationColor: string;
  originalColor: string;
  font: SubtitleFont;
  scale: SubtitleScale;
  // Off shows the translation alone.
  showOriginal: boolean;
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  backgroundOpacity: 30,
  translationColor: SUBTITLE_COLORS.white,
  originalColor: SUBTITLE_COLORS.white,
  font: SUBTITLE_FONT.system,
  scale: 100,
  showOriginal: true,
};

// The box drawn over the video, whatever the extension's theme.
export const SUBTITLE_BOX_RGB = "0 0 0";

// The box's opacity below which the text gets an outline that grows as the
// box fades, so the lines stay readable without a box.
export const SUBTITLE_OUTLINE_OPACITY = 60;

// The least contrast (WCAG) of a picked colour on the box before Settings
// says it may be hard to read.
export const SUBTITLE_READABLE_CONTRAST = 3;

export const SUBTITLE_FONTS: Record<SubtitleFont, string> = {
  system: "system-ui, sans-serif",
  serif: "ui-serif, serif",
  monospace: "ui-monospace, monospace",
};

export function normalizeSubtitleStyle(value: unknown): SubtitleStyle {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<
    Record<keyof SubtitleStyle, unknown>
  >;
  const fallback = DEFAULT_SUBTITLE_STYLE;
  return {
    backgroundOpacity: opacityOf(stored.backgroundOpacity),
    translationColor: colorOf(
      stored.translationColor,
      fallback.translationColor,
    ),
    originalColor: colorOf(stored.originalColor, fallback.originalColor),
    font: oneOf(Object.values(SUBTITLE_FONT), stored.font, fallback.font),
    scale: SUBTITLE_SCALES.includes(stored.scale as SubtitleScale)
      ? (stored.scale as SubtitleScale)
      : fallback.scale,
    showOriginal:
      typeof stored.showOriginal === "boolean"
        ? stored.showOriginal
        : fallback.showOriginal,
  };
}

// A hex colour, or a name an earlier release stored; `fallback` otherwise.
function colorOf(value: unknown, fallback: string) {
  if (typeof value === "string" && Object.hasOwn(NAMED_SUBTITLE_COLORS, value))
    return NAMED_SUBTITLE_COLORS[value]!;
  return parseHexColor(value) ?? fallback;
}

// A whole step within the range; the default for anything else.
function opacityOf(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return DEFAULT_SUBTITLE_STYLE.backgroundOpacity;
  const { min, max, step } = SUBTITLE_OPACITY;
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}

// The box over the video at `opacity` percent.
export function subtitleBox(opacity: number) {
  return `rgb(${SUBTITLE_BOX_RGB} / ${opacity / 100})`;
}

// The text's shadow: a soft one under it, and the outline below
// SUBTITLE_OUTLINE_OPACITY.
export function subtitleShadow(opacity: number) {
  const outline =
    Math.round(Math.max(0, 1 - opacity / SUBTITLE_OUTLINE_OPACITY) * 95) / 100;
  const soft = "0 1px 2px rgb(0 0 0 / 0.5)";
  return outline
    ? `0 0 2px rgb(0 0 0 / ${outline}), 0 0 2px rgb(0 0 0 / ${outline}), ${soft}`
    : soft;
}

// Whether `color` stays readable on the box at `opacity` over a white
// frame. Below SUBTITLE_OUTLINE_OPACITY the outline takes over the box's
// part, so the box there counts as at that opacity.
export function subtitleColorReadable(color: string, opacity: number) {
  const alpha = Math.max(opacity, SUBTITLE_OUTLINE_OPACITY) / 100;
  const box = SUBTITLE_BOX_RGB.split(" ")
    .map((value) =>
      Math.round(Number(value) * alpha + 255 * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
  return contrast(color, `#${box}`) >= SUBTITLE_READABLE_CONTRAST;
}

// The custom properties the subtitle layer's CSS reads (see
// src/video-subtitles/overlay-css.ts).
export function subtitleStyleProperties(
  style: SubtitleStyle,
): Record<string, string> {
  return {
    "--oba-subtitle-background": subtitleBox(style.backgroundOpacity),
    "--oba-subtitle-shadow": subtitleShadow(style.backgroundOpacity),
    "--oba-subtitle-text": style.originalColor,
    "--oba-subtitle-translation": style.translationColor,
    "--oba-subtitle-font": SUBTITLE_FONTS[style.font],
    "--oba-subtitle-scale": String(style.scale / 100),
    "--oba-subtitle-original-display": style.showOriginal ? "block" : "none",
  };
}
