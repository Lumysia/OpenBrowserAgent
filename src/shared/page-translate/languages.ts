// Languages pages can be translated into, with the code each engine uses for
// them. Dependency-free: the page script imports this module.

type PageTranslateLanguage = {
  // A BCP 47 tag; names come from Intl.DisplayNames in the UI language.
  tag: string;
  google?: string;
  microsoft?: string;
  // Chrome's Translator API; absent where it has no model.
  browser?: string | null;
};

// Static data: one row per language.
export const PAGE_TRANSLATE_LANGUAGES: readonly PageTranslateLanguage[] = [
  { tag: "en" },
  { tag: "zh-CN", microsoft: "zh-Hans", browser: "zh" },
  { tag: "zh-TW", microsoft: "zh-Hant", browser: "zh-Hant" },
  { tag: "ja" },
  { tag: "ko" },
  { tag: "fr" },
  { tag: "de" },
  { tag: "es" },
  { tag: "pt-BR", google: "pt", microsoft: "pt", browser: "pt" },
  { tag: "pt-PT", google: "pt-PT", microsoft: "pt-PT", browser: null },
  { tag: "it" },
  { tag: "ru" },
  { tag: "uk" },
  { tag: "pl" },
  { tag: "nl" },
  { tag: "sv" },
  { tag: "da" },
  { tag: "nb", google: "no", microsoft: "nb", browser: "no" },
  { tag: "fi" },
  { tag: "cs" },
  { tag: "sk" },
  { tag: "hu" },
  { tag: "ro" },
  { tag: "bg" },
  { tag: "hr" },
  { tag: "el" },
  { tag: "tr" },
  { tag: "ar" },
  { tag: "he", google: "iw" },
  { tag: "fa", browser: null },
  { tag: "hi" },
  { tag: "bn" },
  { tag: "id" },
  { tag: "ms", browser: null },
  { tag: "th" },
  { tag: "vi" },
];

type PageTranslateCodeEngine = "google" | "microsoft" | "browser";

// The engine's code for `tag`, or undefined when the engine lacks it.
export function engineLanguageCode(
  engine: PageTranslateCodeEngine,
  tag: string,
) {
  const language = PAGE_TRANSLATE_LANGUAGES.find((item) => item.tag === tag);
  if (!language) return undefined;
  const code = language[engine];
  if (code === null) return undefined;
  return code ?? language.tag;
}

// The few offered where a short list fits (the toolbar button's "Translate
// into" menu): the table starts with them.
export const QUICK_TARGET_LANGUAGES = PAGE_TRANSLATE_LANGUAGES.slice(0, 8).map(
  ({ tag }) => tag,
);
