import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import {
  DEFAULT_PAGE_TRANSLATE_SETTINGS,
  normalizePageTranslateSettings,
} from "../src/shared/page-translate/settings";
import {
  DEFAULT_SUBTITLE_STYLE,
  normalizeSubtitleStyle,
  SUBTITLE_ORIGINAL_COLORS,
  SUBTITLE_TRANSLATION_COLORS,
  subtitleBox,
  subtitleShadow,
  subtitleStyleProperties,
} from "../src/shared/video-subtitles/style";

test("subtitle style: settings from the last release read with the default style", () => {
  // Written by 0.2.0-beta.19: no subtitleStyle.
  const stored = { ...DEFAULT_PAGE_TRANSLATE_SETTINGS } as Record<
    string,
    unknown
  >;
  delete stored.subtitleStyle;
  assert.deepEqual(
    mergePreferences({ pageTranslate: stored as never }).pageTranslate
      ?.subtitleStyle,
    DEFAULT_SUBTITLE_STYLE,
  );
  assert.deepEqual(
    normalizePageTranslateSettings(undefined).subtitleStyle,
    DEFAULT_SUBTITLE_STYLE,
  );
  assert.equal(DEFAULT_SUBTITLE_STYLE.backgroundOpacity, 60);
});

test("subtitle style: invalid values fall back one by one, valid ones stay", () => {
  assert.deepEqual(normalizeSubtitleStyle("dark"), DEFAULT_SUBTITLE_STYLE);
  assert.deepEqual(
    normalizeSubtitleStyle({
      backgroundOpacity: "80",
      translationColor: "purple",
      originalColor: "grey",
      font: "Comic Sans",
      scale: 117,
      showOriginal: "no",
    }),
    {
      ...DEFAULT_SUBTITLE_STYLE,
      originalColor: "grey",
    },
  );
  assert.equal(normalizeSubtitleStyle({ scale: "150" }).scale, 100);
  // Opacity: whole steps within 0-100.
  const opacity = (backgroundOpacity: unknown) =>
    normalizeSubtitleStyle({ backgroundOpacity }).backgroundOpacity;
  assert.equal(opacity(0), 0);
  assert.equal(opacity(100), 100);
  assert.equal(opacity(150), 100);
  assert.equal(opacity(-10), 0);
  assert.equal(opacity(42), 40);
  assert.equal(opacity(Number.NaN), 60);
  assert.equal(opacity(null), 60);
  assert.deepEqual(
    normalizeSubtitleStyle({
      backgroundOpacity: 0,
      translationColor: "cyan",
      originalColor: "white",
      font: "monospace",
      scale: 150,
      showOriginal: false,
    }),
    {
      backgroundOpacity: 0,
      translationColor: "cyan",
      originalColor: "white",
      font: "monospace",
      scale: 150,
      showOriginal: false,
    },
  );
});

test("subtitle style: the layer's custom properties", () => {
  const properties = subtitleStyleProperties({
    ...DEFAULT_SUBTITLE_STYLE,
    scale: 130,
    showOriginal: false,
  });
  assert.equal(properties["--oba-subtitle-scale"], "1.3");
  assert.equal(properties["--oba-subtitle-original-display"], "none");
  assert.equal(properties["--oba-subtitle-background"], "rgb(0 0 0 / 0.6)");
  // The outline comes in as the box fades out.
  assert.doesNotMatch(subtitleShadow(60), /0 0 2px/);
  assert.doesNotMatch(subtitleShadow(100), /0 0 2px/);
  assert.match(subtitleShadow(30), /0 0 2px rgb\(0 0 0 \/ 0\.48\)/);
  assert.match(subtitleShadow(0), /0 0 2px rgb\(0 0 0 \/ 0\.95\)/);
});

// sRGB relative luminance and contrast ratio (WCAG 2).
const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]) =>
  0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
const contrast = (a: number[], b: number[]) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
};
const hex = (color: string) =>
  [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
// An `rgb(r g b / a)` box over a white frame.
const overWhite = (color: string) => {
  const [r, g, b, a] = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/
    .exec(color)!
    .slice(1)
    .map(Number);
  return [r!, g!, b!].map((value) => value * a! + 255 * (1 - a!));
};

test("subtitle style: every text colour stays readable on the default box over a bright frame", () => {
  const box = overWhite(subtitleBox(DEFAULT_SUBTITLE_STYLE.backgroundOpacity));
  for (const color of [
    ...Object.values(SUBTITLE_TRANSLATION_COLORS),
    ...Object.values(SUBTITLE_ORIGINAL_COLORS),
  ])
    assert.ok(
      contrast(hex(color), box) >= 4.5,
      `${color}: ${contrast(hex(color), box).toFixed(2)}`,
    );
  // The default is lighter than the box of earlier versions.
  assert.ok(luminance(box) > luminance(overWhite("rgb(8 8 8 / 0.78)")));
});
