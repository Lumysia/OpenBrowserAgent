import type { PageTranslateContext } from "../../../shared/page-translate/context";
import type { TermExample } from "../term-memory";
import {
  PAGE_TRANSLATE_CONTENT,
  type PageTranslateBatchLimits,
  type PageTranslateContent,
  type PageTranslateErrorKind,
  type PageTranslateItem,
} from "../../../shared/page-translate/protocol";

export type EngineRequest = {
  items: PageTranslateItem[];
  // A language tag from PAGE_TRANSLATE_LANGUAGES.
  target: string;
  // The page's declared language, a hint at best.
  pageLanguage?: string;
  pageTitle?: string;
  // What the items are: the page's text when unset, or a video's
  // subtitles. Engines that translate texts one by one ignore it.
  content?: PageTranslateContent;
  // The page's description, and where the batch is on the page (see
  // context.ts). Reference for engines that read context, like terms.
  pageDescription?: string;
  context?: PageTranslateContext;
  // Earlier translations on the page with the same names (see
  // term-memory.ts). Engines that translate texts one by one ignore them.
  terms?: TermExample[];
  signal: AbortSignal;
  // A finished item, in placeholder text. Items never reported failed.
  onItem: (id: number, text: string) => void;
  // The item being written so far, as plain text (streaming engines only).
  onPartial?: (id: number, text: string) => void;
};

// A translation engine: the AI model, the browser's translator, or a free
// web service. Everything engine-specific stays behind this interface, so
// other features (the smart bar, a built-in provider) can use the same
// engines later.
export type TranslationEngine = {
  // Shared limits: one gate per id across all tabs.
  id: string;
  // Identifies what produced a translation, for the cache: the engine and
  // its model or prompt version.
  cacheKey: string;
  // Its own cache key for content it translates differently from page text
  // (the AI model's subtitle prompt).
  contentCacheKeys?: Partial<Record<PageTranslateContent, string>>;
  limits: PageTranslateBatchLimits;
  translate: (request: EngineRequest) => Promise<void>;
};

export class EngineError extends Error {
  constructor(
    readonly kind: PageTranslateErrorKind,
    message: string,
    // From Retry-After, for rate limits.
    readonly retryAfterMs?: number,
    // The request was too large; smaller batches may work.
    readonly tooLarge = false,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

// The cache key for what `engine` translates for `content`.
export function engineCacheKey(
  engine: TranslationEngine,
  content: PageTranslateContent = PAGE_TRANSLATE_CONTENT.page,
) {
  return engine.contentCacheKeys?.[content] ?? engine.cacheKey;
}
