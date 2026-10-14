import { normalizeLanguageTag } from "./language-tags";

// The name of a language, in `inLanguage` (English by default, for prompts
// that tell the model which language to reply in). The full tag keeps
// variants apart (Chinese (Taiwan) vs (China)). `fallback` when the tag is
// not a language.
export function languageName(
  code: string,
  { inLanguage = "en", fallback = "English" } = {},
) {
  const tag = normalizeLanguageTag(code);
  if (!tag) return fallback;
  try {
    return (
      new Intl.DisplayNames([inLanguage], { type: "language" }).of(tag) ||
      fallback
    );
  } catch {
    return fallback;
  }
}
