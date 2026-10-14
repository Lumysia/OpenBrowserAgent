import { engineLanguageCode } from "../../../shared/page-translate/languages";
import {
  closeTag,
  openTag,
  tokenizePlaceholders,
} from "../../../shared/page-translate/placeholders";
import { PAGE_TRANSLATE_ERROR } from "../../../shared/page-translate/protocol";
import {
  GOOGLE_KEY_RETRY_MS,
  GOOGLE_TRANSLATE_FALLBACK_URL,
  GOOGLE_TRANSLATE_HTML_CLIENT,
  GOOGLE_TRANSLATE_HTML_URL,
  GOOGLE_TRANSLATE_WIDGET_KEY,
} from "./free-config";
import { decodeEntities, escapeHtml, fetchJson } from "./http";
import {
  EngineError,
  type EngineRequest,
  type TranslationEngine,
} from "./types";

const SERVICE = "Google Translate";

// When the key-based endpoint last failed for good (refused or broken).
let keyFailedAt = 0;

export function googleEngine(): TranslationEngine {
  return {
    id: "google",
    cacheKey: "google",
    limits: { concurrency: 4, maxItems: 40, maxChars: 4000, firstItems: 6 },
    translate: translateWithGoogle,
  };
}

async function translateWithGoogle(request: EngineRequest) {
  const target = engineLanguageCode("google", request.target);
  if (!target)
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.unavailable,
      `${SERVICE}: no ${request.target}`,
    );
  const html = request.items.map((item) => toGoogleHtml(item.text));
  let results: string[] | undefined;
  if (Date.now() - keyFailedAt > GOOGLE_KEY_RETRY_MS)
    results = await translateHtml(html, target, request.signal).catch(
      (error) => {
        if (request.signal.aborted) throw error;
        // A refused key or a changed response: use the fallback for a while.
        // A rate limit there may not apply to the fallback, so try it once.
        if (
          error instanceof EngineError &&
          error.kind !== PAGE_TRANSLATE_ERROR.rateLimited &&
          error.kind !== PAGE_TRANSLATE_ERROR.network
        )
          keyFailedAt = Date.now();
        if (error instanceof EngineError && error.tooLarge) throw error;
        return undefined;
      },
    );
  results ??= await translateFallback(html, target, request.signal);
  request.items.forEach((item, index) => {
    const result = results[index];
    if (typeof result === "string")
      request.onItem(item.id, fromGoogleHtml(result));
  });
}

export async function translateHtml(
  html: string[],
  target: string,
  signal: AbortSignal,
) {
  const data = await fetchJson(SERVICE, GOOGLE_TRANSLATE_HTML_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json+protobuf",
      "X-Goog-API-Key": GOOGLE_TRANSLATE_WIDGET_KEY,
    },
    body: JSON.stringify([
      [html, "auto", target],
      GOOGLE_TRANSLATE_HTML_CLIENT,
    ]),
    signal,
  });
  // [[translation, …], [detected language, …]]
  const translations = Array.isArray(data) ? data[0] : undefined;
  if (
    !Array.isArray(translations) ||
    translations.length !== html.length ||
    translations.some((item) => typeof item !== "string")
  )
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.failed,
      `${SERVICE}: unexpected response`,
    );
  return translations as string[];
}

export async function translateFallback(
  html: string[],
  target: string,
  signal: AbortSignal,
) {
  const url = new URL(GOOGLE_TRANSLATE_FALLBACK_URL);
  url.search = new URLSearchParams({
    client: "gtx",
    dt: "t",
    sl: "auto",
    tl: target,
    format: "html",
  }).toString();
  const body = new URLSearchParams();
  for (const item of html) body.append("q", item);
  const data = await fetchJson(SERVICE, url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal,
  });
  // [[translation, detected language], …]; one text may come back bare.
  const rows = Array.isArray(data)
    ? html.length === 1 && typeof data[0] === "string"
      ? [data]
      : data
    : [];
  const translations = rows.map((row) =>
    Array.isArray(row) ? row[0] : typeof row === "string" ? row : undefined,
  );
  if (
    translations.length !== html.length ||
    translations.some((item) => typeof item !== "string")
  )
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.failed,
      `${SERVICE}: unexpected response`,
    );
  return translations as string[];
}

// Placeholder text as the HTML Google keeps markup in: pairs become
// `<a i=N>`, text is escaped; atoms stay `{N}`, which Google leaves alone.
export function toGoogleHtml(text: string) {
  return tokenizePlaceholders(text)
    .map((token) =>
      token.type === "text"
        ? escapeHtml(token.value)
        : token.type === "open"
          ? `<a i=${token.id}>`
          : token.type === "close"
            ? "</a>"
            : `{${token.id}}`,
    )
    .join("");
}

const TAG = /<(\/?)([a-z]+)\b([^>]*)>/gi;
// Google puts a space between a closing tag and the punctuation after it.
const SPACE_BEFORE_PUNCTUATION =
  /(<\/b\d+>)\s+(?=[.,;:!?)\]}…。，、；：！？）」』])/g;

// Google's HTML back to placeholder text. Other tags are Google's own: with
// some clients it pairs every sentence with the original in `<i>`, which is
// dropped.
export function fromGoogleHtml(html: string) {
  const stack: Array<number | undefined> = [];
  let output = "";
  let last = 0;
  let skipping = 0;
  const text = (value: string) => {
    if (!skipping) output += decodeEntities(value);
  };
  for (const match of html.matchAll(TAG)) {
    text(html.slice(last, match.index));
    last = match.index + match[0].length;
    const [, closing, name, attributes] = match;
    const tag = name.toLowerCase();
    if (tag === "i") skipping += closing ? -1 : 1;
    else if (tag === "a" && !closing) {
      const id = /\bi\s*=\s*"?(\d+)/.exec(attributes)?.[1];
      stack.push(id === undefined ? undefined : Number(id));
      if (id !== undefined && !skipping) output += openTag(Number(id));
    } else if (tag === "a") {
      const id = stack.pop();
      if (id !== undefined && !skipping) output += closeTag(id);
    }
    skipping = Math.max(0, skipping);
  }
  text(html.slice(last));
  return output.replace(SPACE_BEFORE_PUNCTUATION, "$1").trim();
}
