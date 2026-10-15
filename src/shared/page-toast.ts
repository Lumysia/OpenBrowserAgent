// The short notes the extension shows on web pages (copied as Markdown,
// page translation problems); src/page-toast draws them. Dependency-free:
// the background and page scripts share these types.
import type { ColorScheme, ThemeId } from "./theme/themes";

// The user's theme; the page resolves "system" when the note shows.
export type PageToastTheme = {
  colorScheme: ColorScheme;
  accentColor: ThemeId;
};

export type PageToastOptions = {
  // "error" notes carry an alert icon and are announced at once.
  tone: "info" | "error";
  durationMs: number;
};

// The page script that shows a note (PAGE_SCRIPT.pageToast) leaves
// showPageToast under this global of the extension's isolated world.
export const PAGE_TOAST_GLOBAL = "__obaShowPageToast";
