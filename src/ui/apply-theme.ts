import {
  normalizeColorScheme,
  normalizeTheme,
  type ResolvedScheme,
} from "../shared/theme/themes";
import { themeTokens, TOKEN_NAMES } from "../shared/theme/tokens";

// Without React: page scripts (the page notes) use it too.

export type ThemeChoice = { accentColor?: unknown; colorScheme?: unknown };

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveScheme(colorScheme: unknown): ResolvedScheme {
  const scheme = normalizeColorScheme(colorScheme);
  if (scheme !== "system") return scheme;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

// The one place a theme reaches the DOM: the side panel and settings set it
// on <html>, the smart bar and the page notes on their own root inside the
// page.
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
