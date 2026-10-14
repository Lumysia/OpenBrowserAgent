import { useLayoutEffect } from "react";
import { normalizeColorScheme } from "../shared/theme/themes";
import { applyTheme, DARK_QUERY, type ThemeChoice } from "./apply-theme";

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
