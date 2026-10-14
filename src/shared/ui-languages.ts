import { matchLanguageTag } from "./language-tags";

// The languages of the extension's UI: the code stored in
// `storage.language`, and the name in the language itself. Other tags are
// served by the closest of these (resolveLanguage). The messages are in
// i18n.ts.
export const UI_LANGUAGES = [
  { code: "en-US", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "es-ES", label: "Español" },
  { code: "pt-BR", label: "Português (Brasil)" },
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"];

export const DEFAULT_UI_LANGUAGE: UiLanguage = "en-US";

const CODES: readonly UiLanguage[] = UI_LANGUAGES.map(({ code }) => code);

// The UI language that serves `language` (any BCP 47 tag, e.g. the
// browser's "fr" or "zh-HK"), else English.
export function resolveLanguage(language?: string): UiLanguage {
  return (
    (matchLanguageTag(language, CODES) as UiLanguage | undefined) ??
    DEFAULT_UI_LANGUAGE
  );
}
