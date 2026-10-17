// How translated subtitles look: what the user picks in Settings, kept
// in the page translation settings and sent to the pages with the subtitle
// config. Dependency-free: the page script imports this module.
import { oneOf } from "../values";

// How much the box behind each line covers the video, in percent: 0 draws
// the text alone, 100 an opaque box.
export const SUBTITLE_OPACITY = { min: 0, max: 100, step: 5 } as const;

export const SUBTITLE_TRANSLATION_COLOR = {
  yellow: "yellow",
  white: "white",
  cyan: "cyan",
} as const;

export type SubtitleTranslationColor =
  (typeof SUBTITLE_TRANSLATION_COLOR)[keyof typeof SUBTITLE_TRANSLATION_COLOR];

export const SUBTITLE_ORIGINAL_COLOR = {
  white: "white",
  grey: "grey",
} as const;

export type SubtitleOriginalColor =
  (typeof SUBTITLE_ORIGINAL_COLOR)[keyof typeof SUBTITLE_ORIGINAL_COLOR];

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
  translationColor: SubtitleTranslationColor;
  originalColor: SubtitleOriginalColor;
  font: SubtitleFont;
  scale: SubtitleScale;
  // Off shows the translation alone.
  showOriginal: boolean;
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  backgroundOpacity: 60,
  translationColor: SUBTITLE_TRANSLATION_COLOR.yellow,
  originalColor: SUBTITLE_ORIGINAL_COLOR.white,
  font: SUBTITLE_FONT.system,
  scale: 100,
  showOriginal: true,
};

// The colours drawn over the video, whatever the extension's theme. Every
// text colour keeps a contrast of 4.5:1 or more on the default box over a
// white frame (checked by a unit test).
export const SUBTITLE_BOX_RGB = "0 0 0";

export const SUBTITLE_TRANSLATION_COLORS: Record<
  SubtitleTranslationColor,
  string
> = {
  yellow: "#ffe9a6",
  white: "#ffffff",
  cyan: "#bfefff",
};

export const SUBTITLE_ORIGINAL_COLORS: Record<SubtitleOriginalColor, string> = {
  white: "#ffffff",
  grey: "#e6e6e6",
};

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
    translationColor: oneOf(
      Object.values(SUBTITLE_TRANSLATION_COLOR),
      stored.translationColor,
      fallback.translationColor,
    ),
    originalColor: oneOf(
      Object.values(SUBTITLE_ORIGINAL_COLOR),
      stored.originalColor,
      fallback.originalColor,
    ),
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

// The text's shadow: a soft one under it, and an outline that grows as the
// box fades below the default, so the lines stay readable without a box.
export function subtitleShadow(opacity: number) {
  const outline =
    Math.round(
      Math.max(0, 1 - opacity / DEFAULT_SUBTITLE_STYLE.backgroundOpacity) * 95,
    ) / 100;
  const soft = "0 1px 2px rgb(0 0 0 / 0.5)";
  return outline
    ? `0 0 2px rgb(0 0 0 / ${outline}), 0 0 2px rgb(0 0 0 / ${outline}), ${soft}`
    : soft;
}

// The custom properties the subtitle layer's CSS reads (see
// src/video-subtitles/overlay-css.ts).
export function subtitleStyleProperties(
  style: SubtitleStyle,
): Record<string, string> {
  return {
    "--oba-subtitle-background": subtitleBox(style.backgroundOpacity),
    "--oba-subtitle-shadow": subtitleShadow(style.backgroundOpacity),
    "--oba-subtitle-text": SUBTITLE_ORIGINAL_COLORS[style.originalColor],
    "--oba-subtitle-translation":
      SUBTITLE_TRANSLATION_COLORS[style.translationColor],
    "--oba-subtitle-font": SUBTITLE_FONTS[style.font],
    "--oba-subtitle-scale": String(style.scale / 100),
    "--oba-subtitle-original-display": style.showOriginal ? "block" : "none",
  };
}
