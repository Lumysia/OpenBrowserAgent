import assert from "node:assert/strict";
import { test } from "node:test";
import { mergePreferences } from "../src/shared/default-preferences";
import { contrast } from "../src/shared/theme/color";
import {
  ACCENT_THEMES,
  DEFAULT_THEME,
  normalizeColorScheme,
  normalizeTheme,
  PRIDE_THEMES,
  THEMES,
} from "../src/shared/theme/themes";
import {
  textPairs,
  themeTokens,
  TOKEN_NAMES,
} from "../src/shared/theme/tokens";

const SCHEMES = ["light", "dark"] as const;
const ALL_THEMES = [...ACCENT_THEMES, ...PRIDE_THEMES];

test("body and button text reads at 4.5:1 in every theme and scheme", () => {
  const failures: string[] = [];
  for (const theme of ALL_THEMES)
    for (const scheme of SCHEMES)
      for (const pair of textPairs(themeTokens(theme, scheme)))
        if (pair.ratio < 4.5)
          failures.push(
            `${theme}/${scheme}: ${pair.text} on ${pair.background} ${pair.ratio.toFixed(2)}`,
          );
  assert.deepEqual(failures, []);
});

test("every theme defines every token as a color", () => {
  for (const theme of ALL_THEMES)
    for (const scheme of SCHEMES) {
      const tokens = themeTokens(theme, scheme);
      for (const name of TOKEN_NAMES)
        assert.match(tokens[name], /^(#[0-9a-f]{6}|rgb\(.+\))$/, name);
    }
});

test("the contrast math matches WCAG reference values", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(contrast("#767676", "#ffffff").toFixed(2), "4.54");
});

test("pride themes keep their flag's hues in the large areas", () => {
  for (const theme of PRIDE_THEMES) {
    const definition = THEMES[theme];
    assert.ok(definition.flag && definition.flag.length >= 3, theme);
    const light = themeTokens(theme, "light");
    // The bubble gradient spans two hues where the flag gives two.
    if (definition.bubble && definition.bubble[0] !== definition.bubble[1])
      assert.notEqual(light.bubble, light["bubble-2"], theme);
  }
  const trans = themeTokens("trans", "light");
  assert.notEqual(
    trans["accent-soft"],
    themeTokens("pink", "light")["accent-soft"],
  );
});

test("an unknown stored theme shows pink and stays stored as it is", () => {
  assert.equal(DEFAULT_THEME, "pink");
  for (const value of ["sparkle", "", null, undefined, 3, "PINK"])
    assert.equal(normalizeTheme(value), "pink");
  assert.deepEqual(themeTokens("sparkle", "dark"), themeTokens("pink", "dark"));
  for (const theme of ALL_THEMES) assert.equal(normalizeTheme(theme), theme);
  assert.equal(normalizeColorScheme("sepia"), "system");
  // Reading preferences keeps a value this version does not know, so a
  // newer version's choice survives a round trip through this one.
  const stored = { accentColor: "sparkle" } as unknown as Parameters<
    typeof mergePreferences
  >[0];
  assert.equal(mergePreferences(stored).accentColor, "sparkle");
  assert.equal(mergePreferences({}).accentColor, "pink");
});
