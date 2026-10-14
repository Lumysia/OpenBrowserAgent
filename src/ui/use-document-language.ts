import { useLayoutEffect } from "react";
import { resolveLanguage } from "../shared/i18n";

// <html lang> follows the UI language, for screen readers, hyphenation and
// fonts.
export function useDocumentLanguage(language: string | undefined) {
  useLayoutEffect(() => {
    document.documentElement.lang = resolveLanguage(language);
  }, [language]);
}
