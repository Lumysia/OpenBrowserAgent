import { sameLanguage } from "../../../shared/language-tags";
import { engineLanguageCode } from "../../../shared/page-translate/languages";
import { stripPlaceholders } from "../../../shared/page-translate/placeholders";
import {
  PAGE_TRANSLATE_CONTENT,
  PAGE_TRANSLATE_ERROR,
} from "../../../shared/page-translate/protocol";
import { wordCount } from "../../../shared/text";
import {
  EngineError,
  type EngineRequest,
  type TranslationEngine,
} from "./types";

// Chrome's on-device Translator and LanguageDetector APIs (Chrome 138+,
// Edge 148+), where the background has them.
type Availability =
  "unavailable" | "downloadable" | "downloading" | "available";
type TranslatorInstance = {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
};
type TranslatorApi = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<Availability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslatorInstance>;
};
type DetectorApi = {
  availability(): Promise<Availability>;
  create(): Promise<{
    detect(
      text: string,
    ): Promise<Array<{ detectedLanguage?: string; confidence?: number }>>;
  }>;
};

const api = () => (globalThis as { Translator?: TranslatorApi }).Translator;
const detectorApi = () =>
  (globalThis as { LanguageDetector?: DetectorApi }).LanguageDetector;

const SERVICE = "Built-in translator";
// Raised when subtitles saved before would now be translated differently.
const BROWSER_SUBTITLES_CACHE_VERSION = 1;

// One translator per language pair; each translates one text at a time.
const translators = new Map<string, Promise<TranslatorInstance>>();
// The detector of the LanguageDetector API it was made from.
let detector:
  { api: DetectorApi; instance: ReturnType<DetectorApi["create"]> } | undefined;

export function browserEngine(): TranslationEngine {
  return {
    id: "browser",
    cacheKey: "browser",
    // Subtitles have a key of their own: lines saved under "browser" were
    // taken to be in the page's language and some were left untranslated.
    contentCacheKeys: {
      [PAGE_TRANSLATE_CONTENT.subtitles]: `browser:subtitles:${BROWSER_SUBTITLES_CACHE_VERSION}`,
    },
    limits: { concurrency: 1, maxItems: 12, maxChars: 3000, firstItems: 4 },
    translate: translateInBrowser,
  };
}

async function translateInBrowser(request: EngineRequest) {
  const translator = api();
  if (!translator)
    throw new EngineError(PAGE_TRANSLATE_ERROR.unavailable, `${SERVICE}: none`);
  const target = engineLanguageCode("browser", request.target);
  if (!target)
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.unavailable,
      `${SERVICE}: no ${request.target}`,
    );
  const { groups, language } = await groupBySource(request);
  // The translator refuses some texts one by one (filtered output, too
  // long, an unknown failure, a language it has no pair for): the batch's
  // other items still go through. A batch it translated none of fails with
  // the first refusal.
  let refusal: unknown;
  let translated = false;
  for (const [source, items] of groups) {
    if (request.signal.aborted) return;
    // Already in the target language: kept as it is. The translator would
    // otherwise treat it as the source language and garble it.
    if (sameLanguage(source, request.target)) {
      for (const item of items) request.onItem(item.id, item.text);
      translated = true;
      continue;
    }
    let instance: TranslatorInstance;
    try {
      instance = await translatorFor(translator, source, target);
    } catch (error) {
      // No pair for the batch's language: the page is in a language this
      // translator can't do. Texts in another language of their own (a
      // quote) are refused alone.
      if (sameLanguage(source, language)) throw error;
      refusal ??= error;
      continue;
    }
    for (const item of items) {
      if (request.signal.aborted) return;
      try {
        const text = await instance.translate(item.text, {
          signal: request.signal,
        });
        translated = true;
        request.onItem(item.id, text.trim());
      } catch (error) {
        if (request.signal.aborted) return;
        if (!isItemRefusal(error)) throw error;
        refusal ??= error;
      }
    }
  }
  if (refusal && !translated) throw refusal;
}

// The detector's guess for one text is taken only when it is this sure and
// the text has this many words (numbers aside): short texts such as titles,
// buttons and names ("Harbor - 7.05") are easily misread, also with high
// confidence.
const MIN_ITEM_CONFIDENCE = 0.6;
const MIN_ITEM_WORDS = 3;
// Characters given to the detector for a batch as a whole.
const DETECT_CHARS = 2000;

// The batch's items by source language, and the language of the batch as a
// whole. Pages mix languages (posts in several languages, a Chinese line in
// an English page), so each text long enough to tell is detected on its
// own; the others take the language their source declares, else the
// batch's: the detector's guess for all of its text (with the earlier text
// of its source when that alone tells nothing) when it is sure, else the
// page's declared language, else the detector's unsure guess, else the
// language hint. Every source but the hint is evidence of what the text is
// in, so a text is left as it is only on evidence: a hint in the target
// language says nothing (an English video on a site whose interface is in
// the target language). A text in no language found is refused: the page
// says the built-in translator can't translate it.
async function groupBySource(request: EngineRequest) {
  const texts = request.items.map((item) => stripPlaceholders(item.text));
  const joined = texts.join("\n");
  const [batch, ...own] = await Promise.all([
    detect(joined.slice(0, DETECT_CHARS)),
    ...texts.map((text) =>
      wordCount(text.replace(/\p{N}+/gu, " ")) >= MIN_ITEM_WORDS
        ? detect(text)
        : undefined,
    ),
  ]);
  // Too little to tell (a few short subtitle lines): the same source's
  // earlier text with it, before giving up.
  const whole =
    batch ??
    (request.sample
      ? await detect(
          `${stripPlaceholders(request.sample)}\n${joined}`.slice(
            -DETECT_CHARS,
          ),
        )
      : undefined);
  const hint =
    request.languageHint && !sameLanguage(request.languageHint, request.target)
      ? request.languageHint
      : undefined;
  const language =
    (whole && whole.confidence >= MIN_ITEM_CONFIDENCE
      ? whole.language
      : request.pageLanguage) ||
    whole?.language ||
    hint;
  const groups = new Map<string, EngineRequest["items"]>();
  request.items.forEach((item, index) => {
    const guess = own[index];
    const source =
      guess && guess.confidence >= MIN_ITEM_CONFIDENCE
        ? guess.language
        : item.language || language;
    if (!source)
      throw new EngineError(
        PAGE_TRANSLATE_ERROR.unavailable,
        `${SERVICE}: unknown source language`,
      );
    groups.set(source, [...(groups.get(source) ?? []), item]);
  });
  return { groups, language };
}

// Translator errors about the text it was given, not about the translator
// (see the Translator API's errors): disabled by policy (`NotAllowedError`)
// or ended (`AbortError`, `InvalidStateError`) applies to every text.
const TRANSLATOR_ERRORS = new Set([
  "NotAllowedError",
  "AbortError",
  "InvalidStateError",
]);

function isItemRefusal(error: unknown) {
  return error instanceof DOMException && !TRANSLATOR_ERRORS.has(error.name);
}

async function detect(text: string) {
  const languageDetector = detectorApi();
  if (!languageDetector) return undefined;
  try {
    if (detector?.api !== languageDetector)
      detector = {
        api: languageDetector,
        instance: languageDetector.availability().then((availability) => {
          if (availability === "unavailable") throw new Error(availability);
          return languageDetector.create();
        }),
      };
    const [best] = await (await detector.instance).detect(text);
    return best?.detectedLanguage && best.detectedLanguage !== "und"
      ? { language: best.detectedLanguage, confidence: best.confidence ?? 0 }
      : undefined;
  } catch {
    detector = undefined;
    return undefined;
  }
}

function translatorFor(
  translator: TranslatorApi,
  sourceLanguage: string,
  targetLanguage: string,
) {
  const key = `${sourceLanguage}>${targetLanguage}`;
  let instance = translators.get(key);
  if (!instance) {
    instance = (async () => {
      const options = { sourceLanguage, targetLanguage };
      // A pair the browser rejects or can't set up counts as unavailable:
      // the page says to choose another engine.
      const unavailable = (reason: unknown) =>
        new EngineError(
          PAGE_TRANSLATE_ERROR.unavailable,
          `${SERVICE}: ${key} ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      let availability: Availability;
      try {
        availability = await translator.availability(options);
      } catch (error) {
        throw unavailable(error);
      }
      if (availability === "unavailable") throw unavailable(availability);
      try {
        // Downloads the language pack the first time.
        return await translator.create(options);
      } catch (error) {
        throw unavailable(error);
      }
    })();
    instance.catch(() => translators.delete(key));
    translators.set(key, instance);
  }
  return instance;
}
