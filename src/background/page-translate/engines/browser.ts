import {
  engineLanguageCode,
  sameLanguage,
} from "../../../shared/page-translate/languages";
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

export function hasBrowserTranslator() {
  return typeof api()?.create === "function";
}

const SERVICE = "Built-in translator";

// One translator per language pair; each translates one text at a time.
const translators = new Map<string, Promise<TranslatorInstance>>();
let detector: ReturnType<DetectorApi["create"]> | undefined;

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
  const sample = request.items
    .map((item) => stripPlaceholders(item.text))
    .join("\n")
    .slice(0, 2000);
  const source = (await detect(sample)) || request.pageLanguage;
  if (!source)
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.unavailable,
      `${SERVICE}: unknown source language`,
    );
  if (sameLanguage(source, request.target)) {
    for (const item of request.items) request.onItem(item.id, item.text);
    return;
  }
  const instance = await translatorFor(translator, source, target);
  for (const item of request.items) {
    if (request.signal.aborted) return;
    const text = await instance.translate(item.text, {
      signal: request.signal,
    });
    request.onItem(item.id, text.trim());
  }
}

async function detect(text: string) {
  const languageDetector = detectorApi();
  if (!languageDetector) return undefined;
  try {
    detector ??= languageDetector.availability().then((availability) => {
      if (availability === "unavailable") throw new Error(availability);
      return languageDetector.create();
    });
    const [best] = await (await detector).detect(text);
    return best?.detectedLanguage && best.detectedLanguage !== "und"
      ? best.detectedLanguage
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
      if ((await translator.availability(options)) === "unavailable")
        throw new EngineError(
          PAGE_TRANSLATE_ERROR.unavailable,
          `${SERVICE}: ${key} unavailable`,
        );
      // Downloads the language pack the first time; the user chose this
      // engine and asked for the translation.
      return translator.create(options);
    })();
    instance.catch(() => translators.delete(key));
    translators.set(key, instance);
  }
  return instance;
}
