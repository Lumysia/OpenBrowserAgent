import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import { parseHexColor } from "../src/shared/theme/color";
import {
  DEFAULT_PAGE_TRANSLATE_SETTINGS,
  normalizePageTranslateSettings,
} from "../src/shared/page-translate/settings";
import {
  DEFAULT_SUBTITLE_STYLE,
  normalizeSubtitleStyle,
  SUBTITLE_COLOR_PRESETS,
  SUBTITLE_OUTLINE_OPACITY,
  subtitleBox,
  subtitleColorReadable,
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
});

test("subtitle style: new installs get a light box and white lines", () => {
  assert.deepEqual(DEFAULT_SUBTITLE_STYLE, {
    backgroundOpacity: 30,
    translationColor: "#ffffff",
    originalColor: "#ffffff",
    font: "system",
    scale: 100,
    showOriginal: true,
  });
});

test("subtitle style: colours named by 0.2.0-beta.24 read as the colours they showed", () => {
  // Stored by 0.2.0-beta.24, which kept the colours by name.
  const stored = {
    ...DEFAULT_PAGE_TRANSLATE_SETTINGS,
    subtitleStyle: {
      backgroundOpacity: 60,
      translationColor: "yellow",
      originalColor: "grey",
      font: "serif",
      scale: 115,
      showOriginal: true,
    },
  };
  assert.deepEqual(
    mergePreferences({ pageTranslate: stored as never }).pageTranslate
      ?.subtitleStyle,
    {
      backgroundOpacity: 60,
      translationColor: "#ffe9a6",
      originalColor: "#e6e6e6",
      font: "serif",
      scale: 115,
      showOriginal: true,
    },
  );
  const color = (translationColor: string) =>
    normalizeSubtitleStyle({ translationColor }).translationColor;
  assert.equal(color("white"), "#ffffff");
  assert.equal(color("cyan"), "#bfefff");
  // Names never stored are no colours.
  assert.equal(color("green"), DEFAULT_SUBTITLE_STYLE.translationColor);
  assert.equal(color("toString"), DEFAULT_SUBTITLE_STYLE.translationColor);
});

test("subtitle style: colours are stored as #rrggbb", () => {
  const color = (originalColor: unknown) =>
    normalizeSubtitleStyle({ originalColor }).originalColor;
  assert.equal(color("#FFCC00"), "#ffcc00");
  assert.equal(color("#fc0"), "#ffcc00");
  assert.equal(color(" #abcdef "), "#abcdef");
  assert.equal(color("abcdef"), "#abcdef");
  for (const invalid of ["#ffcc0", "#ggg", "#ffcc0011", "red", "", 0xffffff])
    assert.equal(color(invalid), DEFAULT_SUBTITLE_STYLE.originalColor);
  assert.equal(parseHexColor("#12"), undefined);
});

test("subtitle style: invalid values fall back one by one, valid ones stay", () => {
  assert.deepEqual(normalizeSubtitleStyle("dark"), DEFAULT_SUBTITLE_STYLE);
  assert.deepEqual(
    normalizeSubtitleStyle({
      backgroundOpacity: "80",
      translationColor: "purple",
      originalColor: "#e6e6e6",
      font: "Comic Sans",
      scale: 117,
      showOriginal: "no",
    }),
    {
      ...DEFAULT_SUBTITLE_STYLE,
      originalColor: "#e6e6e6",
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
  assert.equal(opacity(Number.NaN), 30);
  assert.equal(opacity(null), 30);
  assert.deepEqual(
    normalizeSubtitleStyle({
      backgroundOpacity: 0,
      translationColor: "#bfefff",
      originalColor: "#123456",
      font: "monospace",
      scale: 150,
      showOriginal: false,
    }),
    {
      backgroundOpacity: 0,
      translationColor: "#bfefff",
      originalColor: "#123456",
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
  assert.equal(properties["--oba-subtitle-background"], "rgb(0 0 0 / 0.3)");
  assert.equal(properties["--oba-subtitle-translation"], "#ffffff");
  assert.equal(
    subtitleStyleProperties({
      ...DEFAULT_SUBTITLE_STYLE,
      translationColor: "#ffcc00",
    })["--oba-subtitle-translation"],
    "#ffcc00",
  );
  // The outline comes in as the box fades out, below 60% whatever the
  // default: on at the default box.
  assert.doesNotMatch(subtitleShadow(60), /0 0 2px/);
  assert.doesNotMatch(subtitleShadow(100), /0 0 2px/);
  assert.match(subtitleShadow(30), /0 0 2px rgb\(0 0 0 \/ 0\.48\)/);
  assert.match(subtitleShadow(0), /0 0 2px rgb\(0 0 0 \/ 0\.95\)/);
  assert.equal(SUBTITLE_OUTLINE_OPACITY, 60);
  assert.match(
    subtitleShadow(DEFAULT_SUBTITLE_STYLE.backgroundOpacity),
    /0 0 2px rgb\(0 0 0 \/ 0\.48\)/,
  );
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

test("subtitle style: every preset stays readable on the box over a bright frame", () => {
  // At and above SUBTITLE_OUTLINE_OPACITY the box alone carries the
  // contrast; below it the outline comes in (see above).
  const box = overWhite(subtitleBox(SUBTITLE_OUTLINE_OPACITY));
  for (const color of Object.values(SUBTITLE_COLOR_PRESETS)) {
    assert.ok(
      contrast(hex(color), box) >= 4.5,
      `${color}: ${contrast(hex(color), box).toFixed(2)}`,
    );
    for (const opacity of [0, DEFAULT_SUBTITLE_STYLE.backgroundOpacity, 100])
      assert.ok(subtitleColorReadable(color, opacity), color);
  }
  assert.ok(
    Object.values(SUBTITLE_COLOR_PRESETS).includes(
      DEFAULT_SUBTITLE_STYLE.translationColor as never,
    ),
  );
  // The default is lighter than the box of earlier versions.
  assert.ok(
    luminance(
      overWhite(subtitleBox(DEFAULT_SUBTITLE_STYLE.backgroundOpacity)),
    ) > luminance(overWhite("rgb(8 8 8 / 0.78)")),
  );
});

test("subtitle style: a dark colour is flagged until the box is dark", () => {
  assert.equal(subtitleColorReadable("#ff0000", 30), false);
  assert.equal(subtitleColorReadable("#ff0000", 60), false);
  assert.equal(subtitleColorReadable("#ff0000", 100), true);
  assert.equal(subtitleColorReadable("#ffff00", 0), true);
});
