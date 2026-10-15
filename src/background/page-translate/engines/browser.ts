import { sameLanguage } from "../../../shared/language-tags";
import { engineLanguageCode } from "../../../shared/page-translate/languages";
import { stripPlaceholders } from "../../../shared/page-translate/placeholders";
import { PAGE_TRANSLATE_ERROR } from "../../../shared/page-translate/protocol";
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

// One translator per language pair; each translates one text at a time.
const translators = new Map<string, Promise<TranslatorInstance>>();
// The detector of the LanguageDetector API it was made from.
let detector:
  { api: DetectorApi; instance: ReturnType<DetectorApi["create"]> } | undefined;

export function browserEngine(): TranslationEngine {
  return {
    id: "browser",
    cacheKey: "browser",
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
  const groups = await groupBySource(request);
  // The translator refuses some texts one by one (filtered output, too
  // long, an unknown failure): the batch's other items still go through.
  // A batch it translated none of fails with the first refusal.
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
    const instance = await translatorFor(translator, source, target);
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

// Below this, the detector's guess for one text is not taken (short texts
// such as buttons and names are easily misread).
const MIN_ITEM_CONFIDENCE = 0.6;

// The batch's items by source language. Pages mix languages (posts in
// several languages, an English name in a Chinese line), so each text is
// detected on its own; one the detector isn't sure of takes the language
// of the batch as a whole, then the page's declared language.
async function groupBySource(request: EngineRequest) {
  const texts = request.items.map((item) => stripPlaceholders(item.text));
  const own = await Promise.all(texts.map((text) => detect(text)));
  let fallback: string | undefined;
  if (own.some((guess) => !guess || guess.confidence < MIN_ITEM_CONFIDENCE))
    fallback =
      (await detect(texts.join("\n").slice(0, 2000)))?.language ||
      request.pageLanguage;
  const groups = new Map<string, EngineRequest["items"]>();
  request.items.forEach((item, index) => {
    const guess = own[index];
    const source =
      guess && guess.confidence >= MIN_ITEM_CONFIDENCE
        ? guess.language
        : fallback;
    if (!source)
      throw new EngineError(
        PAGE_TRANSLATE_ERROR.unavailable,
        `${SERVICE}: unknown source language`,
      );
    groups.set(source, [...(groups.get(source) ?? []), item]);
  });
  return groups;
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
      // A pair the browser rejects or can't set up counts as unavailable, so
      // the page continues with the fallback engine.
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
