import type { PageToastColors, PageToastTheme } from "../shared/page-toast";
import { normalizeColorScheme } from "../shared/theme/themes";
import { themeTokens } from "../shared/theme/tokens";

// The extension's theme for notes shown on web pages.
export function pageToastTheme(
  colorScheme: unknown,
  accent: unknown,
): PageToastTheme {
  const colors = (scheme: "light" | "dark"): PageToastColors => {
    const tokens = themeTokens(accent, scheme);
    return {
      background: tokens.popover,
      foreground: tokens.foreground,
      border: tokens.border,
      accent: tokens["accent-solid"],
      error: tokens["destructive-solid"],
      shadow: tokens["shadow-ambient"],
    };
  };
  return {
    scheme: normalizeColorScheme(colorScheme),
    light: colors("light"),
    dark: colors("dark"),
  };
}
