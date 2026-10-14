// A short note at the top of the page when translating runs into a problem.
// One at a time; "Show original" takes it away with the translations.
import { showPageToast, type PageToastTheme } from "../shared/page-toast";
import { PAGE_TRANSLATE_TOAST_MS } from "../shared/page-translate/protocol";
import { TRANSLATION_ATTRIBUTE } from "./dom-rules";

let current: HTMLElement | undefined;

export function showToast(message: string, theme: PageToastTheme) {
  hideToast();
  showPageToast(
    message,
    theme,
    { tone: "error", durationMs: PAGE_TRANSLATE_TOAST_MS },
    (host) => {
      host.setAttribute(TRANSLATION_ATTRIBUTE, "");
      current = host;
    },
  );
}

export function hideToast() {
  current?.remove();
  current = undefined;
}
