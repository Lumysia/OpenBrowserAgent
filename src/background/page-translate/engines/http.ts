import { errorMessage } from "../../../shared/error-message";
import { parseRetryAfter } from "../../../shared/retry-after";
import { PAGE_TRANSLATE_ERROR } from "../../../shared/page-translate/protocol";
import { EngineError } from "./types";

// A request to a free web service. Throws an EngineError that says what
// went wrong: rate limits (429, 503, or the captcha page Google sends instead
// of JSON), refusals (401/403, an invalid key), oversized requests, network
// failures. Returns the parsed JSON otherwise.
export async function fetchJson(
  service: string,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: "omit" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.network,
      `${service}: ${errorMessage(error)}`,
    );
  }
  const body = await response.text();
  const failure = classifyFailure(service, response, body);
  if (failure) throw failure;
  try {
    return JSON.parse(body);
  } catch {
    throw new EngineError(
      PAGE_TRANSLATE_ERROR.failed,
      `${service}: unexpected response`,
    );
  }
}

export function classifyFailure(
  service: string,
  response: Pick<Response, "status" | "headers">,
  body: string,
): EngineError | undefined {
  const { status } = response;
  const type = response.headers.get("content-type") || "";
  const html = /text\/html/i.test(type) || /^\s*</.test(body);
  const describe = `${service}: HTTP ${status}${html ? " (HTML page)" : ""}`;
  if (status === 429 || status === 503 || (html && status !== 404))
    return new EngineError(
      PAGE_TRANSLATE_ERROR.rateLimited,
      describe,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  if (status === 401 || status === 403 || /API_KEY_INVALID/.test(body))
    return new EngineError(PAGE_TRANSLATE_ERROR.refused, describe);
  if (status === 413 || (status === 400 && /size|too (long|large)/i.test(body)))
    return new EngineError(
      PAGE_TRANSLATE_ERROR.failed,
      describe,
      undefined,
      true,
    );
  if (status < 200 || status >= 300)
    return new EngineError(PAGE_TRANSLATE_ERROR.failed, describe);
  return undefined;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function decodeEntities(text: string) {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1].toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}
