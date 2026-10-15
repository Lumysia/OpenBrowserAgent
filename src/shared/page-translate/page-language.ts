// Whether to offer translating a page: the translate button shows only on
// pages that aren't already in the "Translate into" language. Dependency-free
// for the page scripts.
import {
  normalizeLanguageTag,
  primaryLanguage,
  sameLanguage,
} from "../language-tags";
import type { LanguageDetection } from "../speech-language";

// How much of the page's text the detector reads.
export const PAGE_LANGUAGE_SAMPLE_CHARS = 1000;
// Less text than this tells the detector too little; the page's lang
// attribute decides alone.
export const PAGE_LANGUAGE_MIN_CHARS = 80;
// The detector's best guess counts from this confidence on.
export const PAGE_LANGUAGE_CONFIDENCE = 0.6;

// The page's language: what the detector found in its text if it is sure,
// else what the page declares (`<html lang>`). The declared tag wins when
// both name the same language, since it can say more (zh-TW, not just zh).
// Undefined when neither knows.
export function pageLanguage(
  declared: string | undefined,
  detections: readonly LanguageDetection[] | undefined,
) {
  const tag = normalizeLanguageTag(declared);
  const page = tag && tag !== "und" ? tag : undefined;
  const best = detections?.reduce<LanguageDetection | undefined>(
    (top, item) => (!top || item.confidence > top.confidence ? item : top),
    undefined,
  );
  const detected =
    best && best.confidence >= PAGE_LANGUAGE_CONFIDENCE
      ? normalizeLanguageTag(best.detectedLanguage)
      : undefined;
  if (!detected || detected === "und") return page;
  return page && primaryLanguage(page) === primaryLanguage(detected)
    ? page
    : detected;
}

// Offered unless the page is known to be in the target language.
export function offerPageTranslation(
  language: string | undefined,
  target: string,
) {
  return !language || !sameLanguage(language, target);
}

// Whether the translate button shows. `page` is undefined while the page's
// language is still being read. While the page is translated (or starting
// to be) it stays, to show the original.
export function pageButtonShown(
  config: { enabled: boolean; targetLanguage: string } | undefined,
  page: { language: string | undefined } | undefined,
  active: boolean,
) {
  if (!config?.enabled) return false;
  if (active) return true;
  return !!page && offerPageTranslation(page.language, config.targetLanguage);
}
