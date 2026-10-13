import { useLayoutEffect } from "react";
import {
  normalizeColorScheme,
  normalizeTheme,
  type ResolvedScheme,
} from "../shared/theme/themes";
import { themeTokens, TOKEN_NAMES } from "../shared/theme/tokens";

export type ThemeChoice = { accentColor?: unknown; colorScheme?: unknown };

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveScheme(colorScheme: unknown): ResolvedScheme {
  const scheme = normalizeColorScheme(colorScheme);
  if (scheme !== "system") return scheme;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

// The one place a theme reaches the DOM: the side panel and settings set it
// on <html>, the smart bar on its own root inside the page.
export function applyTheme(element: HTMLElement, choice: ThemeChoice) {
  const scheme = resolveScheme(choice.colorScheme);
  const theme = normalizeTheme(choice.accentColor);
  const tokens = themeTokens(theme, scheme);
  for (const name of TOKEN_NAMES)
    element.style.setProperty(`--${name}`, tokens[name]);
  element.style.colorScheme = scheme;
  element.dataset.scheme = scheme;
  element.dataset.accent = theme;
}

// Applies the theme before paint and follows the system scheme while
// `colorScheme` is "system".
export function useTheme(
  element: HTMLElement | null | undefined,
  { accentColor, colorScheme }: ThemeChoice,
) {
  useLayoutEffect(() => {
    if (!element) return undefined;
    const apply = () => applyTheme(element, { accentColor, colorScheme });
    apply();
    if (normalizeColorScheme(colorScheme) !== "system") return undefined;
    const query = matchMedia(DARK_QUERY);
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [element, accentColor, colorScheme]);
}
