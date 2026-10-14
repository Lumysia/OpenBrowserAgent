// Messages between the page translation page script and the background.
// Dependency-free (types only) for the page script.
import type { PageToastTheme } from "../page-toast";
import type { PageTranslateDisplay, PageTranslateEngine } from "./settings";

// The page script, built by WXT (`registration: "runtime"`) and injected
// when the user first translates a page.
export const PAGE_TRANSLATE_SCRIPT = "content-scripts/page-translate.js";

// Background -> page script (tabs.sendMessage), and page -> background
// (runtime.sendMessage).
export const PAGE_TRANSLATE_MESSAGE = {
  // Background -> page: translate the page, or show the original.
  toggle: "page-translate:toggle",
  // Page -> background: the page is translated now, or not (also after a
  // back/forward navigation restored a translated page).
  state: "page-translate:state",
  // Background -> page: is the page translated? Answers
  // `{ translated: boolean }`.
  query: "page-translate:query",
} as const;

// How long a note about a problem stays on the page.
export const PAGE_TRANSLATE_TOAST_MS = 8_000;

// One port per translated page; closing it cancels its requests.
export const PAGE_TRANSLATE_PORT = "page-translate";

export type PageTranslateToggleMessage = {
  type: typeof PAGE_TRANSLATE_MESSAGE.toggle;
};

export type PageTranslateQueryMessage = {
  type: typeof PAGE_TRANSLATE_MESSAGE.query;
};

export type PageTranslateStateMessage = {
  type: typeof PAGE_TRANSLATE_MESSAGE.state;
  translated: boolean;
};

// What the page needs to know about the session.
export type PageTranslateSessionConfig = {
  engine: PageTranslateEngine;
  targetLanguage: string;
  display: PageTranslateDisplay;
  // Batches the page may have in flight at once, and their size.
  limits: PageTranslateBatchLimits;
};

export type PageTranslateBatchLimits = {
  concurrency: number;
  maxItems: number;
  maxChars: number;
  // The first batch is smaller, so the first translation lands sooner.
  firstItems: number;
};

export type PageTranslateItem = {
  id: number;
  // Placeholder text (see placeholders.ts).
  text: string;
};

export type PageTranslateRequest =
  | {
      type: "start";
      pageLanguage?: string;
      title?: string;
      // The engine the page's last session ended up with, after a switch to
      // the other free service; the new session keeps it.
      engine?: PageTranslateEngine;
    }
  | { type: "translate"; batch: number; items: PageTranslateItem[] };

export const PAGE_TRANSLATE_ERROR = {
  // No model configured, or the engine is unavailable in this browser.
  unavailable: "unavailable",
  // 429 or a captcha page: the service is limiting this network.
  rateLimited: "rateLimited",
  // The service refused the request (401/403, a revoked key).
  refused: "refused",
  network: "network",
  failed: "failed",
  // Both free services failed: the current one and the one it switched to.
  allFailed: "allFailed",
} as const;

export type PageTranslateErrorKind =
  (typeof PAGE_TRANSLATE_ERROR)[keyof typeof PAGE_TRANSLATE_ERROR];

export type PageTranslateEvent =
  | { type: "session"; config: PageTranslateSessionConfig }
  // A finished item; `text` equal to the source means "already in the
  // target language".
  | { type: "item"; batch: number; id: number; text: string }
  // The item being written, as plain text so far.
  | { type: "partial"; batch: number; id: number; text: string }
  // The batch is over; items it didn't return failed.
  | { type: "done"; batch: number }
  | {
      type: "error";
      batch?: number;
      kind: PageTranslateErrorKind;
      // Shown on the page, in the extension's language and theme.
      message: string;
      theme: PageToastTheme;
    }
  // The engine failed and the session continues with another one; the
  // message says so on the page.
  | {
      type: "switched";
      engine: PageTranslateEngine;
      limits: PageTranslateBatchLimits;
      message: string;
      theme: PageToastTheme;
    }
  // The settings changed while the page is translated.
  | { type: "display"; display: PageTranslateDisplay };
