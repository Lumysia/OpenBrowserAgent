import type { PageToastTheme } from "../shared/page-toast";
import { normalizeColorScheme, normalizeTheme } from "../shared/theme/themes";

// The extension's theme for notes shown on web pages.
export function pageToastTheme(
  colorScheme: unknown,
  accent: unknown,
): PageToastTheme {
  return {
    colorScheme: normalizeColorScheme(colorScheme),
    accentColor: normalizeTheme(accent),
  };
}
