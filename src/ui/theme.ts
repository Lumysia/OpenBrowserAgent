import { useLayoutEffect, useSyncExternalStore } from "react";
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

// The theme applyTheme() last set on <html>, as one key: for things drawn
// from the theme's colors outside CSS, which must be drawn again when it
// changes.
export function useAppliedTheme() {
  return useSyncExternalStore(subscribeAppliedTheme, appliedTheme);
}

function appliedTheme() {
  const { scheme = "", accent = "" } = document.documentElement.dataset;
  return `${scheme}:${accent}`;
}

function subscribeAppliedTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-scheme", "data-accent"],
  });
  return () => observer.disconnect();
}
