import { engineLanguageCode } from "../../../shared/page-translate/languages";
import { tokenizePlaceholders } from "../../../shared/page-translate/placeholders";
import { PAGE_TRANSLATE_ERROR } from "../../../shared/page-translate/protocol";
import { MICROSOFT_TRANSLATE_URL } from "./free-config";
import { escapeMarkup } from "../../../shared/xml";
import { decodeEntities, fetchJson } from "./http";
import {
  EngineError,
  type EngineRequest,
  type TranslationEngine,
} from "./types";

const SERVICE = "Microsoft Translator";

export function microsoftEngine(): TranslationEngine {
  return {
    id: "microsoft",
    cacheKey: "microsoft",
    limits: { concurrency: 3, maxItems: 40, maxChars: 4000, firstItems: 6 },
    translate: translateWithMicrosoft,
  };
}

async function translateWithMicrosoft(request: EngineRequest) {
  const target = engineLanguageCode("microsoft", request.target);
  if (!target)
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.unavailable,
      `${SERVICE}: no ${request.target}`,
    );
  const url = new URL(MICROSOFT_TRANSLATE_URL);
  url.search = new URLSearchParams({
    from: "",
    to: target,
    isEnterpriseClient: "false",
  }).toString();
  const data = await fetchJson(SERVICE, url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      request.items.map((item) => toMicrosoftText(item.text)),
    ),
    signal: request.signal,
  });
  // [{ detectedLanguage, translations: [{ text, to }] }, …]
  if (!Array.isArray(data) || data.length !== request.items.length)
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.failed,
      `${SERVICE}: unexpected response`,
    );
  request.items.forEach((item, index) => {
    const text = (data[index] as { translations?: Array<{ text?: unknown }> })
      ?.translations?.[0]?.text;
    if (typeof text === "string")
      request.onItem(item.id, fromMicrosoftText(text));
  });
}

// The service aligns tags in its input, so markers pass as they are; other
// `<` and `&` are escaped so they can't read as tags.
export function toMicrosoftText(text: string) {
  return tokenizePlaceholders(text)
    .map((token) =>
      token.type === "text"
        ? escapeMarkup(token.value)
        : token.type === "open"
          ? `<b${token.id}>`
          : token.type === "close"
            ? `</b${token.id}>`
            : `{${token.id}}`,
    )
    .join("");
}

export function fromMicrosoftText(text: string) {
  return decodeEntities(text).trim();
}
