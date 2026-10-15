// BCP 47 language tag helpers. Dependency-free: the page scripts import this
// module.

// A well-formed language tag (en_US becomes en-US, iw becomes he), or
// undefined.
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
  return (normalizeLanguageTag(tag) ?? tag).split("-")[0].toLowerCase();
}

// The tag with its likely script and region filled in: "zh-HK" ->
// "zh-Hant-HK", "fr" -> "fr-Latn-FR", "pt" -> "pt-Latn-BR".
function maximizedLocale(tag: string | undefined) {
  const normalized = normalizeLanguageTag(tag);
  if (!normalized) return undefined;
  try {
    return new Intl.Locale(normalized).maximize();
  } catch {
    return undefined;
  }
}

// The entry of `supported` that serves `tag` best: the same tag, else the
// same language in the same script (zh-HK and zh-Hant are written like
// zh-TW), preferring the same region, else the same language. Undefined
// when none has the language.
export function matchLanguageTag(
  tag: string | undefined,
  supported: readonly string[],
) {
  const normalized = normalizeLanguageTag(tag)?.toLowerCase();
  const wanted = maximizedLocale(tag);
  if (!normalized || !wanted) return undefined;
  const exact = supported.find(
    (code) => normalizeLanguageTag(code)?.toLowerCase() === normalized,
  );
  if (exact) return exact;
  const candidates = supported
    .map((code) => ({ code, locale: maximizedLocale(code) }))
    .filter(({ locale }) => locale?.language === wanted.language);
  const sameScript = candidates.filter(
    ({ locale }) => locale?.script === wanted.script,
  );
  const pool = sameScript.length ? sameScript : candidates;
  return (
    pool.find(({ locale }) => locale?.region === wanted.region) ?? pool[0]
  )?.code;
}

// Whether two tags name the same language as far as translation goes: the
// same language, and the same script when the language is written in more
// than one ("zh-Hans" and "zh-CN" are the same; "zh-TW" is not).
export function sameLanguage(a: string | undefined, b: string | undefined) {
  const left = maximizedLocale(a);
  const right = maximizedLocale(b);
  if (!left || !right) return false;
  return (
    macroLanguage(left.language) === macroLanguage(right.language) &&
    left.script === right.script
  );
}

// Norwegian ("no") and Norwegian Bokmål ("nb") are one language for
// translation engines.
function macroLanguage(language: string) {
  return language === "no" ? "nb" : language;
}
