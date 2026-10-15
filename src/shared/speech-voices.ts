// Picks the installed voice that reads a language. Dependency-free: the page
// scripts import this module.
import { normalizeLanguageTag, primaryLanguage } from "./language-tags";

type SpeechVoice = Pick<
  SpeechSynthesisVoice,
  "lang" | "localService" | "default"
>;

// The voice for `lang`: one for exactly that tag, else one for the same
// language, closest region and script first. Local voices before network
// ones, the browser's default first among equals.
export function chooseVoice<Voice extends SpeechVoice>(
  voices: readonly Voice[],
  lang: string,
): Voice | undefined {
  const tag = normalizeLanguageTag(lang)?.toLowerCase();
  if (!tag) return undefined;
  const primary = primaryLanguage(tag);
  const target = maximized(tag);
  const rank = (voice: Voice) => {
    const voiceTag = normalizeLanguageTag(voice.lang)?.toLowerCase() ?? "";
    const full = maximized(voiceTag);
    const closeness =
      voiceTag === tag
        ? 0
        : full?.region === target?.region && full?.script === target?.script
          ? 1
          : full?.script === target?.script
            ? 2
            : 3;
    return (
      closeness * 4 + (voice.localService ? 0 : 2) + (voice.default ? 0 : 1)
    );
  };
  return voices
    .filter((voice) => primaryLanguage(voice.lang) === primary)
    .sort((a, b) => rank(a) - rank(b))[0];
}

// The languages, one per primary language, that no voice reads. Nothing
// when the browser lists no voices at all: it may still read with a default.
export function missingVoiceLanguages(
  voices: readonly SpeechVoice[],
  languages: readonly string[],
) {
  if (!voices.length) return [];
  const missing = new Map<string, string>();
  for (const lang of languages) {
    const primary = primaryLanguage(lang);
    if (!missing.has(primary) && !chooseVoice(voices, lang))
      missing.set(primary, lang);
  }
  return [...missing.values()];
}

function maximized(tag: string) {
  try {
    const locale = new Intl.Locale(tag).maximize();
    return { region: locale.region, script: locale.script };
  } catch {
    return undefined;
  }
}
