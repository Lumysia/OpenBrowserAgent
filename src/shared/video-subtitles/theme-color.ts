import type { ThemeId } from "../theme/themes";
import { themeTokens } from "../theme/tokens";

// The "theme colour" quick choice for subtitles: the theme's accent as drawn
// on dark surfaces, since the lines sit on a dark box over the video. Stored
// as this hex, so changing the theme later doesn't recolour the subtitles.
// Kept apart from style.ts, which the page script imports.
export function subtitleThemeColor(theme: ThemeId | undefined): string {
  return themeTokens(theme, "dark")["accent-text"];
}
