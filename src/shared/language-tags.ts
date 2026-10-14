// BCP 47 language tag helpers. Dependency-free: the page scripts import this
// module.

// A well-formed language tag (en_US becomes en-US), or undefined.
export function normalizeLanguageTag(tag: string | undefined) {
  const trimmed = tag?.trim().replace(/_/g, "-");
  if (!trimmed) return undefined;
  try {
    return Intl.getCanonicalLocales(trimmed)[0];
  } catch {
    return undefined;
  }
}

// "zh-Hant-TW" -> "zh".
export function primaryLanguage(tag: string) {
  return tag.replace(/_/g, "-").split("-")[0].toLowerCase();
}
